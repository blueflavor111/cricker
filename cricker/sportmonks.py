"""Poll a live match from the Sportmonks Cricket API and convert it to our events.

    export SPORTMONKS_API_TOKEN=...
    cricker-live --list                         # live fixtures right now
    cricker-live 12345 --db data/cricker.duckdb # poll fixture 12345 every 20s

Each poll fetches the fixture with every ball so far and rebuilds the innings
from scratch, keyed by Sportmonks' ball id. A ball that changes between polls
(a four turned into leg byes, a wicket overturned on review) simply replaces
the old version, and the change is written to the log as a correction.

Files written to --out (default data/live/):

* <fixture>.json: the match as innings of events, in the same shape as
  cricker.bundle.match_events, so the Match Centre engine can replay it.
* <fixture>.log.jsonl: one line per ball first seen (with our clock and the
  provider's timestamp, for measuring latency), per correction, and per poll
  error.

This is a trial build: the mapping from Sportmonks' outcome names to extras
and dismissal kinds follows their documented fields and must be checked
against a real match before we rely on it. Unknown outcome names are kept
and logged rather than guessed.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://cricket.sportmonks.com/api/v2.0"
INCLUDES = "balls.score,balls.batsman,balls.bowler,lineup,localteam,visitorteam,venue"

# Sportmonks scoreboard codes S1..S4 are the innings in order.
INNINGS_RE = re.compile(r"^S(\d)$")

# Dismissal kinds, matched on Sportmonks' outcome name (lower case).
WICKET_KINDS = [
    ("run out", "run out"),
    ("stump", "stumped"),
    ("lbw", "lbw"),
    ("hit wicket", "hit wicket"),
    ("caught and bowled", "caught and bowled"),
    ("catch", "caught"),
    ("caught", "caught"),
    ("bowled", "bowled"),
    ("retired hurt", "retired hurt"),
    ("retired", "retired out"),
    ("obstruct", "obstructing the field"),
    ("timed out", "timed out"),
]


def get(path, token, **params):
    params["api_token"] = token
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.load(r)


def live_fixtures(token):
    return get("livescores", token, include="localteam,visitorteam,league").get("data", [])


def fetch_fixture(token, fixture_id):
    return get(f"fixtures/{fixture_id}", token, include=INCLUDES)["data"]


def unwrap(value):
    """Sportmonks nests includes as {"data": ...} in some responses and inline in others."""
    if isinstance(value, dict) and set(value) == {"data"}:
        return value["data"]
    return value


def ball_key(ball):
    """Over and ball from a value like 34.2 (over 35, ball 2) -> (34, 2)."""
    over, _, n = f"{float(ball):.1f}".partition(".")
    return int(over), int(n)


def wicket_kind(name):
    low = name.lower()
    for needle, kind in WICKET_KINDS:
        if needle in low:
            return kind
    return None


def convert_ball(b, pid):
    """One Sportmonks ball to one event in our format. Returns (event, problems)."""
    s = unwrap(b.get("score")) or {}
    name = s.get("name") or ""
    low = name.lower()
    problems = []
    over, _ = ball_key(b["ball"])
    runs = int(s.get("runs") or 0)
    bye = int(s.get("bye") or 0)
    leg_bye = int(s.get("leg_bye") or 0)
    noball = int(s.get("noball") or 0)
    noball_runs = int(s.get("noball_runs") or 0)

    e = {"o": over, "bat": pid(b.get("batsman_id")), "bowl": pid(b.get("bowler_id")),
         "ns": pid(_non_striker(b)), "rb": 0}
    if "wide" in low:
        # Sportmonks counts the whole wide (penalty plus any run) in runs.
        e["wd"] = max(runs, 1)
    elif bye:
        e["b"] = bye
    elif leg_bye:
        e["lb"] = leg_bye
    else:
        e["rb"] = runs
    if noball:
        e["nb"] = noball
        if noball_runs and not (bye or leg_bye):
            e["rb"] = noball_runs
    if "penalty" in low:
        e["pen"] = runs
        e["rb"] = 0
    if s.get("is_wicket") or s.get("out"):
        kind = wicket_kind(name)
        if kind is None:
            problems.append(f"unknown wicket outcome {name!r}")
            kind = name
        out_id = b.get("batsmanout_id") or b.get("batsman_id")
        fielders = [pid(f) for f in (b.get("catchstump_id"), b.get("runout_by_id")) if f]
        e["w"] = [{"k": kind, "out": pid(out_id), "f": fielders}]
    if not name:
        problems.append("ball has no outcome name")
    return e, problems


def _non_striker(b):
    one, two = b.get("batsman_one_on_creeze_id"), b.get("batsman_two_on_creeze_id")
    if one and one != b.get("batsman_id"):
        return one
    return two


def convert_fixture(fx, pid):
    """The fixture's balls grouped into innings, in delivery order.

    Returns (innings, by_id, problems): innings in our event format, the
    converted event for every Sportmonks ball id (for change detection), and
    any outcome names we could not map.
    """
    teams = {}
    for side in ("localteam", "visitorteam"):
        t = unwrap(fx.get(side)) or {}
        if t.get("id"):
            teams[t["id"]] = t.get("name")
    balls = unwrap(fx.get("balls")) or []
    groups, by_id, problems = {}, {}, []
    for b in balls:
        m = INNINGS_RE.match(str(b.get("scoreboard", "")))
        if not m:
            continue
        e, p = convert_ball(b, pid)
        problems += [f"ball {b.get('id')} ({b.get('ball')}): {x}" for x in p]
        by_id[b["id"]] = e
        groups.setdefault(int(m.group(1)), {"team": teams.get(b.get("team_id"), b.get("team_id")),
                                            "balls": []})["balls"].append(b)
    innings = []
    for n in sorted(groups):
        g = groups[n]
        # Ball ids rise in the order the provider recorded them, which keeps a
        # wide and the ball re-bowled after it in the right order.
        ordered = sorted(g["balls"], key=lambda b: (ball_key(b["ball"]), b["id"]))
        innings.append({"team": g["team"], "declared": False, "forfeited": False,
                        "balls": [by_id[b["id"]] for b in ordered]})
    return innings, by_id, problems


def name_matcher(db_path):
    """Map Sportmonks players to Cricsheet ids by name, using our people table.

    Exact full-name match first, then a unique surname plus first initial.
    Anything else stays unmapped as "sm:<id>" so it never joins the wrong
    player's history.
    """
    if not db_path:
        return lambda player: None
    import duckdb

    con = duckdb.connect(db_path, read_only=True)
    rows = con.execute("SELECT person_id, name, display_name FROM people").fetchall()
    full, initials = {}, {}
    for pid, name, display in rows:
        for n in {name, display} - {None}:
            full.setdefault(n.lower(), set()).add(pid)
        if display:
            parts = display.split()
            initials.setdefault((parts[0][0].lower(), parts[-1].lower()), set()).add(pid)

    def match(player):
        names = [player.get("fullname"), f"{player.get('firstname', '')} {player.get('lastname', '')}".strip()]
        for n in filter(None, names):
            hits = full.get(n.lower(), set())
            if len(hits) == 1:
                return next(iter(hits))
        first, last = player.get("firstname") or "", player.get("lastname") or ""
        if first and last:
            hits = initials.get((first[0].lower(), last.split()[-1].lower()), set())
            if len(hits) == 1:
                return next(iter(hits))
        return None

    return match


class Poller:
    def __init__(self, token, fixture_id, out_dir, match_player, map_path):
        self.token, self.fixture_id = token, fixture_id
        self.out = Path(out_dir)
        self.out.mkdir(parents=True, exist_ok=True)
        self.log_path = self.out / f"{fixture_id}.log.jsonl"
        self.map_path = Path(map_path)
        self.ids = json.loads(self.map_path.read_text()) if self.map_path.exists() else {}
        self.match_player = match_player
        self.seen = {}
        self.reported = set()

    def log(self, **row):
        row["at"] = dt.datetime.now(dt.UTC).isoformat(timespec="milliseconds")
        with self.log_path.open("a") as f:
            f.write(json.dumps(row) + "\n")

    def learn_players(self, fx):
        players = list(unwrap(fx.get("lineup")) or [])
        for b in unwrap(fx.get("balls")) or []:
            players += [p for p in (unwrap(b.get("batsman")), unwrap(b.get("bowler"))) if p]
        changed = False
        for p in players:
            key = str(p.get("id"))
            if key in self.ids or not p.get("id"):
                continue
            pid = self.match_player(p)
            self.ids[key] = pid
            changed = True
            self.log(event="player", sportmonks=p["id"], name=p.get("fullname"), cricsheet=pid)
        if changed:
            self.map_path.parent.mkdir(parents=True, exist_ok=True)
            self.map_path.write_text(json.dumps(self.ids, indent=1, sort_keys=True) + "\n")

    def pid(self, sm_id):
        if not sm_id:
            return None
        return self.ids.get(str(sm_id)) or f"sm:{sm_id}"

    def poll_once(self):
        fx = fetch_fixture(self.token, self.fixture_id)
        self.learn_players(fx)
        innings, by_id, problems = convert_fixture(fx, self.pid)
        raw = {b["id"]: b for b in unwrap(fx.get("balls")) or []}
        for ball_id, e in by_id.items():
            b = raw[ball_id]
            if ball_id not in self.seen:
                self.log(event="ball", id=ball_id, ball=b.get("ball"), innings=b.get("scoreboard"),
                         provider_updated=b.get("updated_at"), outcome=(unwrap(b.get("score")) or {}).get("name"))
            elif self.seen[ball_id] != e:
                self.log(event="correction", id=ball_id, ball=b.get("ball"),
                         before=self.seen[ball_id], after=e, provider_updated=b.get("updated_at"))
        for gone in set(self.seen) - set(by_id):
            self.log(event="removed", id=gone, before=self.seen[gone])
        for p in set(problems) - self.reported:
            self.log(event="unmapped", detail=p)
        self.reported |= set(problems)
        self.seen = by_id
        doc = {
            "source": {"provider": "sportmonks", "fixture": self.fixture_id,
                       "fetched": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
                       "status": fx.get("status"), "note": fx.get("note")},
            "innings": innings,
        }
        (self.out / f"{self.fixture_id}.json").write_text(json.dumps(doc, separators=(",", ":")))
        return fx, len(by_id)

    def run(self, every):
        while True:
            try:
                fx, n = self.poll_once()
                print(f"{dt.datetime.now():%H:%M:%S} {fx.get('status')}: {n} balls", flush=True)
                if fx.get("status") in ("Finished", "Cancl.", "Aban."):
                    return
            except Exception as exc:  # keep polling through network blips
                self.log(event="error", detail=repr(exc))
                print(f"poll failed: {exc!r}", file=sys.stderr, flush=True)
            time.sleep(every)


def summarize(log_path):
    """Print latency and correction counts from a poll log."""
    rows = [json.loads(line) for line in Path(log_path).read_text().splitlines()]
    balls = [r for r in rows if r["event"] == "ball"]
    lags = []
    for r in balls:
        if r.get("provider_updated"):
            seen = dt.datetime.fromisoformat(r["at"])
            prov = dt.datetime.fromisoformat(r["provider_updated"].replace("Z", "+00:00"))
            lags.append((seen - prov).total_seconds())
    print(f"balls seen: {len(balls)}")
    if lags:
        lags.sort()
        print(f"seen after provider timestamp: median {lags[len(lags) // 2]:.0f}s, "
              f"90th pct {lags[int(len(lags) * 0.9)]:.0f}s, max {lags[-1]:.0f}s")
    for kind in ("correction", "removed", "unmapped", "error"):
        print(f"{kind}: {sum(r['event'] == kind for r in rows)}")
    players = [r for r in rows if r["event"] == "player"]
    print(f"players: {len(players)}, unmapped to Cricsheet: {sum(r['cricsheet'] is None for r in players)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("fixture", nargs="?", help="Sportmonks fixture id")
    parser.add_argument("--list", action="store_true", help="list live fixtures and exit")
    parser.add_argument("--once", action="store_true", help="poll once and exit")
    parser.add_argument("--summary", metavar="LOG", help="print latency and corrections from a log")
    parser.add_argument("--every", type=float, default=20, help="seconds between polls")
    parser.add_argument("--db", help="DuckDB with Cricsheet people, for player id mapping")
    parser.add_argument("--out", default="data/live")
    parser.add_argument("--players", default="data/live/sportmonks_players.json",
                        help="saved Sportmonks to Cricsheet player id map")
    args = parser.parse_args()
    if args.summary:
        return summarize(args.summary)
    token = os.environ.get("SPORTMONKS_API_TOKEN")
    if not token:
        parser.error("set SPORTMONKS_API_TOKEN")
    if args.list:
        for f in live_fixtures(token):
            home = (unwrap(f.get("localteam")) or {}).get("name")
            away = (unwrap(f.get("visitorteam")) or {}).get("name")
            league = (unwrap(f.get("league")) or {}).get("name")
            print(f"{f['id']}\t{f.get('type')}\t{home} v {away}\t{league}\t{f.get('status')}")
        return
    if not args.fixture:
        parser.error("give a fixture id, or --list")
    poller = Poller(token, args.fixture, args.out, name_matcher(args.db), args.players)
    if args.once:
        _, n = poller.poll_once()
        print(f"{n} balls")
    else:
        poller.run(args.every)


if __name__ == "__main__":
    main()
