"""Build the JSON bundle the Match Centre reads for one match.

    cricker-bundle data/cricker.duckdb 1426557 web/public/data/1426557.json

A bundle holds two things:

* the match itself as normalized ball-by-ball events, which the web app
  replays to rebuild the state at any delivery, and
* history: per-innings rows for every player and pairing in the match, the
  ground and the host country, taken only from Tests that started before
  this one. Nothing from this match or later can leak into a "before this
  match" figure, because it isn't in the file.

Row layouts are listed in HISTORY_COLUMNS and mirrored in web/src/engine/types.ts.
"""

import argparse
import datetime as dt
import json
from pathlib import Path
from types import SimpleNamespace

import duckdb

from cricker.ingest import BOWLER_WICKETS

SCHEMA_VERSION = 1

# A batter is out for averages on any dismissal except retiring hurt or not out.
NOT_OUT_KINDS = ("retired hurt", "retired not out")

HISTORY_COLUMNS = {
    # One row per batter per pairing per innings.
    "h2h": ["match", "innings", "balls", "runs", "outs", "dots", "ones", "twos", "threes", "fours", "sixes"],
    "batting": ["match", "innings", "balls", "runs", "outs", "bowler_outs", "dots", "ones", "twos", "threes", "fours", "sixes"],
    "bowling": ["match", "innings", "balls", "runs", "wickets", "dots"],
    # Team innings at the ground or in the country. cum is runs at the end of
    # each over; wkts lists the over (with the ball as a fraction) of each wicket.
    "team_innings": ["match", "innings", "team", "runs", "wickets", "balls", "declared", "cum", "wkts"],
}

# Every query below reads from this view: Tests of the same gender that
# started before the cutoff.
PRIOR_VIEW = """
CREATE OR REPLACE TEMP VIEW prior_matches AS
SELECT * FROM matches
WHERE match_type = 'Test' AND gender IS NOT DISTINCT FROM $gender AND start_date < $cutoff;

CREATE OR REPLACE TEMP VIEW prior_balls AS
SELECT d.*, prior_matches.start_date,
       d.wides = 0 AS faced,
       d.wides = 0 AND d.noballs = 0 AS legal,
       coalesce(x.batter_out_bowler, false) AS batter_out_bowler
FROM deliveries d
JOIN prior_matches USING (match_id)
LEFT JOIN (
    SELECT match_id, innings, seq,
           bool_or(bowler_credited) AS batter_out_bowler
    FROM dismissals GROUP BY ALL
) x USING (match_id, innings, seq);

CREATE OR REPLACE TEMP VIEW prior_outs AS
SELECT x.* FROM dismissals x JOIN prior_matches USING (match_id)
WHERE x.kind NOT IN {not_out};
""".format(not_out=NOT_OUT_KINDS)

SCORING = """
    count(*) FILTER (WHERE faced)                               AS balls,
    coalesce(sum(runs_batter), 0)                               AS runs,
    {outs},
    count(*) FILTER (WHERE faced AND runs_batter = 0)           AS dots,
    count(*) FILTER (WHERE runs_batter = 1)                     AS ones,
    count(*) FILTER (WHERE runs_batter = 2)                     AS twos,
    count(*) FILTER (WHERE runs_batter = 3)                     AS threes,
    count(*) FILTER (WHERE runs_batter = 4 AND NOT non_boundary) AS fours,
    count(*) FILTER (WHERE runs_batter = 6 AND NOT non_boundary) AS sixes
"""


def rows(con, sql, params=None):
    return con.execute(sql, params or {}).fetchall()


def h2h_rows(con, batters, bowlers):
    sql = f"""
    SELECT batter_id, bowler_id, match_id, innings, {SCORING.format(
        outs="count(*) FILTER (WHERE batter_out_bowler) AS outs")}
    FROM prior_balls
    WHERE list_contains($batters, batter_id) AND list_contains($bowlers, bowler_id)
    GROUP BY ALL ORDER BY batter_id, bowler_id, min(start_date), innings
    """
    out = {}
    for bat, bowl, *row in rows(con, sql, {"batters": batters, "bowlers": bowlers}):
        out.setdefault(f"{bat}|{bowl}", []).append(row)
    return out


def batting_rows(con, players):
    # An innings counts if the batter faced a ball, stood at the other end or
    # was dismissed (a run out without facing still uses up an innings).
    sql = f"""
    WITH appeared AS (
        SELECT DISTINCT match_id, innings, p AS person_id FROM prior_balls,
            unnest([batter_id, non_striker_id]) t(p)
        WHERE list_contains($players, p)
        UNION
        SELECT match_id, innings, player_out_id FROM prior_outs
        WHERE list_contains($players, player_out_id)
    ),
    scoring AS (
        SELECT batter_id AS person_id, match_id, innings, {SCORING.format(
            outs="0 AS unused")}
        FROM prior_balls WHERE list_contains($players, batter_id) GROUP BY ALL
    ),
    outs AS (
        SELECT player_out_id AS person_id, match_id, innings,
               count(*) AS outs, count(*) FILTER (WHERE bowler_credited) AS bowler_outs
        FROM prior_outs GROUP BY ALL
    )
    SELECT a.person_id, a.match_id, a.innings,
           coalesce(s.balls, 0), coalesce(s.runs, 0),
           coalesce(o.outs, 0), coalesce(o.bowler_outs, 0),
           coalesce(s.dots, 0), coalesce(s.ones, 0), coalesce(s.twos, 0),
           coalesce(s.threes, 0), coalesce(s.fours, 0), coalesce(s.sixes, 0)
    FROM appeared a
    JOIN prior_matches m USING (match_id)
    LEFT JOIN scoring s USING (person_id, match_id, innings)
    LEFT JOIN outs o USING (person_id, match_id, innings)
    ORDER BY a.person_id, m.start_date, a.innings
    """
    out = {}
    for pid, *row in rows(con, sql, {"players": players}):
        out.setdefault(pid, []).append(row)
    return out


def bowling_rows(con, players):
    sql = """
    SELECT bowler_id, match_id, innings,
           count(*) FILTER (WHERE legal) AS balls,
           coalesce(sum(runs_batter + wides + noballs), 0) AS runs,
           count(*) FILTER (WHERE batter_out_bowler) AS wickets,
           count(*) FILTER (WHERE legal AND runs_batter = 0) AS dots
    FROM prior_balls WHERE list_contains($players, bowler_id)
    GROUP BY ALL ORDER BY bowler_id, min(start_date), innings
    """
    out = {}
    for pid, *row in rows(con, sql, {"players": players}):
        out.setdefault(pid, []).append(row)
    return out


def top_opponents(con, players, as_batter):
    """Most frequent bowler-credited dismissals: who got each batter out, or
    whom each bowler got out, across all prior Tests."""
    me, them = ("batter_id", "bowler_id") if as_batter else ("bowler_id", "batter_id")
    sql = f"""
    SELECT {me}, {them}, count(*) AS n FROM prior_balls
    WHERE batter_out_bowler AND list_contains($players, {me})
    GROUP BY 1, 2 QUALIFY row_number() OVER (PARTITION BY {me} ORDER BY n DESC, {them}) <= 6
    ORDER BY 1, 3 DESC
    """
    out = {}
    for pid, other, n in rows(con, sql, {"players": players}):
        out.setdefault(pid, []).append([other, n])
    return out


def team_innings(con, where):
    """Team innings with their over-by-over progression."""
    sql = f"""
    WITH b AS (
        SELECT pb.*, x.wkts_on_ball FROM prior_balls pb
        JOIN prior_matches m USING (match_id)
        LEFT JOIN (
            SELECT match_id, innings, seq, count(*) AS wkts_on_ball FROM prior_outs GROUP BY ALL
        ) x USING (match_id, innings, seq)
        WHERE {where}
    ),
    legal_no AS (
        SELECT *, count(*) FILTER (WHERE legal) OVER (
            PARTITION BY match_id, innings ORDER BY seq) AS legal_so_far
        FROM b
    ),
    per_over AS (
        SELECT match_id, innings, over, sum(runs_total) AS r FROM b GROUP BY ALL
    ),
    cum AS (
        SELECT match_id, innings,
               list(sum_r ORDER BY over) AS cum
        FROM (SELECT *, sum(r) OVER (PARTITION BY match_id, innings ORDER BY over) AS sum_r FROM per_over)
        GROUP BY ALL
    ),
    wk AS (
        SELECT match_id, innings, list(pos ORDER BY seq) AS wkts
        FROM (SELECT match_id, innings, seq, round(legal_so_far / 6.0, 3) AS pos,
                     unnest(range(wkts_on_ball)) FROM legal_no WHERE wkts_on_ball > 0)
        GROUP BY ALL
    ),
    tot AS (
        SELECT match_id, innings, any_value(batting_team) AS team,
               sum(runs_total) AS runs, coalesce(sum(wkts_on_ball), 0) AS wickets,
               count(*) FILTER (WHERE legal) AS balls
        FROM b GROUP BY ALL
    )
    SELECT t.match_id, t.innings, t.team, t.runs, t.wickets, t.balls,
           i.declared, c.cum, coalesce(w.wkts, [])
    FROM tot t
    JOIN innings i USING (match_id, innings)
    JOIN cum c USING (match_id, innings)
    LEFT JOIN wk w USING (match_id, innings)
    JOIN prior_matches m USING (match_id)
    ORDER BY m.start_date, t.innings
    """
    return [list(r) for r in rows(con, sql)]


def match_events(raw, registry):
    """The match's deliveries as compact event objects, zeros left out."""
    pid = lambda name: registry.get(name, name)  # noqa: E731
    innings = []
    for i, inn in enumerate(raw.get("innings", []), start=1):
        balls = []
        for over in inn.get("overs", []):
            for d in over["deliveries"]:
                ex = d.get("extras", {})
                e = {"o": over["over"], "bat": pid(d["batter"]), "bowl": pid(d["bowler"]),
                     "ns": pid(d["non_striker"]), "rb": d["runs"]["batter"]}
                for key, name in (("wd", "wides"), ("nb", "noballs"), ("b", "byes"),
                                  ("lb", "legbyes"), ("pen", "penalty")):
                    if ex.get(name):
                        e[key] = ex[name]
                if d["runs"].get("non_boundary"):
                    e["nbd"] = 1
                if d.get("wickets"):
                    e["w"] = [{
                        "k": w["kind"], "out": pid(w["player_out"]),
                        "f": ["sub" if f.get("substitute") else pid(f["name"])
                              for f in w.get("fielders", []) if f.get("name")],
                    } for w in d["wickets"]]
                balls.append(e)
        innings.append({"team": inn["team"], "declared": bool(inn.get("declared")),
                        "forfeited": bool(inn.get("forfeited")), "balls": balls})
    return innings


def build(con, raw_dir, match_id, annotations=None):
    cur = con.execute("SELECT * FROM matches WHERE match_id = ?", [match_id])
    m = SimpleNamespace(**dict(zip([c[0] for c in cur.description], cur.fetchone())))
    raw = json.loads((Path(raw_dir) / f"{match_id}.json").read_text())
    registry = raw["info"]["registry"]["people"]
    con.execute(PRIOR_VIEW.replace("$gender", "'%s'" % m.gender if m.gender else "NULL").replace(
        "$cutoff", "DATE '%s'" % m.start_date))

    teams = [m.team1, m.team2]
    squads = {t: [] for t in teams}
    for team, pid in rows(con, "SELECT team, person_id FROM match_players WHERE match_id = ?", [match_id]):
        squads.setdefault(team, []).append(pid)
    events = match_events(raw, registry)
    # Replacements (concussion subs) appear in the events but not the XI.
    for inn in events:
        for e in inn["balls"]:
            for role, team in (("bat", inn["team"]), ("ns", inn["team"])):
                if e[role] not in squads[team]:
                    squads[team].append(e[role])
            other = teams[1] if inn["team"] == teams[0] else teams[0]
            if e["bowl"] not in squads[other]:
                squads[other].append(e["bowl"])
    players = squads[teams[0]] + squads[teams[1]]

    h2h = {}
    for bat_team, bowl_team in (teams, teams[::-1]):
        h2h.update(h2h_rows(con, squads[bat_team], squads[bowl_team]))
    batting = batting_rows(con, players)
    bowling = bowling_rows(con, players)

    venue_innings = team_innings(con, f"m.venue_id = '{m.venue_id}'")
    country_innings = team_innings(con, f"m.country = '{m.country}'") if m.country else []

    # Every match a row refers to, so the app can filter by date, ground,
    # country, series and opponent.
    ref = {r[0] for v in (*h2h.values(), *batting.values(), *bowling.values()) for r in v}
    ref |= {r[0] for r in venue_innings + country_innings}
    lookup = {}
    if ref:
        for r in rows(con, """
            SELECT m.match_id, m.start_date, m.venue_id, m.venue_name, m.city, m.country,
                   m.event_name, m.season, m.team1, m.team2, m.winner, m.result,
                   m.toss_winner, m.toss_decision,
                   list(i.batting_team ORDER BY i.innings) AS inns
            FROM prior_matches m JOIN innings i USING (match_id)
            WHERE list_contains($ids, m.match_id) GROUP BY ALL""", {"ids": sorted(ref)}):
            (mid, date, vid, vname, city, country, event, season, t1, t2, winner, result,
             toss_w, toss_d, inns) = r
            lookup[mid] = {"date": str(date), "venue": vid, "venueName": vname, "city": city,
                           "country": country, "series": series_key(event, season),
                           "teams": [t1, t2], "winner": winner, "result": result,
                           "toss": [toss_w, toss_d], "inns": inns}

    people_ids = set(players)
    dismissed_by = top_opponents(con, players, True)
    dismissed = top_opponents(con, players, False)
    people_ids |= {o for v in (*dismissed_by.values(), *dismissed.values()) for o, _ in v}
    people = {pid: {"name": n, "display": d} for pid, n, d in rows(
        con, "SELECT person_id, name, display_name FROM people WHERE list_contains($ids, person_id)",
        {"ids": sorted(people_ids)})}

    info = raw["info"]
    outcome = info.get("outcome", {})
    return {
        "schema": SCHEMA_VERSION,
        "generated": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "source": {
            "provider": "cricsheet",
            "url": f"https://cricsheet.org/matches/{match_id}",
            "dataVersion": raw.get("meta", {}).get("data_version"),
            "revision": raw.get("meta", {}).get("revision"),
            "created": raw.get("meta", {}).get("created"),
            "licence": "Open Data Commons Attribution License (ODC-By) 1.0",
        },
        "match": {
            "id": match_id,
            "format": "Test",
            "gender": m.gender,
            "series": {"key": series_key(m.event_name, m.season), "name": m.event_name,
                       "season": m.season, "number": m.match_number},
            "dates": info["dates"],
            "venue": {"id": m.venue_id, "name": m.venue_name, "city": m.city, "country": m.country,
                      "raw": m.venue},
            "teams": teams,
            "toss": {"winner": m.toss_winner, "decision": m.toss_decision},
            "outcome": {"winner": outcome.get("winner"), "result": outcome.get("result"),
                        "by": outcome.get("by", {}), "method": outcome.get("method")},
            "playerOfMatch": [registry.get(p, p) for p in info.get("player_of_match", [])],
            # Cricsheet only publishes finished matches.
            "complete": True,
        },
        "squads": squads,
        "people": people,
        "innings": events,
        "annotations": annotations or {},
        "history": {
            "before": str(m.start_date),
            "columns": HISTORY_COLUMNS,
            "matches": lookup,
            "h2h": h2h,
            "batting": batting,
            "bowling": bowling,
            "dismissedBy": dismissed_by,
            "dismissed": dismissed,
            "venue": venue_innings,
            "country": country_innings,
        },
    }


def series_key(event, season):
    return f"{event} {season}" if event and season else None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("db_path")
    parser.add_argument("raw_dir", help="directory of Cricsheet JSON files")
    parser.add_argument("match_id")
    parser.add_argument("out", help="where to write the bundle JSON")
    parser.add_argument("--annotations", help="JSON of curated extras, e.g. close-of-play markers")
    args = parser.parse_args()
    con = duckdb.connect(args.db_path, read_only=True)
    notes = json.loads(Path(args.annotations).read_text()) if args.annotations else None
    bundle = build(con, args.raw_dir, args.match_id, notes)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(bundle, separators=(",", ":"), default=str))
    print(f"Wrote {args.out} ({Path(args.out).stat().st_size // 1024} KB)")
    update_index(Path(args.out).parent, bundle)


def update_index(folder, bundle):
    """Keep index.json in the bundle folder listing every match, oldest first."""
    path = folder / "index.json"
    index = json.loads(path.read_text()) if path.exists() else []
    m = bundle["match"]
    n = m["series"]["number"]
    entry = {
        "id": m["id"],
        "date": m["dates"][0],
        "title": f"{m['teams'][0]} v {m['teams'][1]}, {m['venue']['name']}",
        "short": f"{f'Test {n}: ' if n else ''}{m['venue']['city'] or m['venue']['name']} {m['dates'][0][:4]}",
    }
    index = sorted([e for e in index if e["id"] != entry["id"]] + [entry], key=lambda e: e["date"])
    path.write_text(json.dumps(index, indent=1) + "\n")


if __name__ == "__main__":
    main()
