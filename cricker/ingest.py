"""Load Cricsheet JSON match files into a DuckDB database.

Download the data first, e.g. https://cricsheet.org/downloads/tests_json.zip,
unzip it into a directory, then run:

    cricker-ingest data/raw/tests data/cricker.duckdb --names data/raw/names.csv

The tables are the normalized layer between Cricsheet's raw files and every
statistic Cricker shows; see docs/DATA.md for the definitions.
"""

import argparse
import csv
import json
from pathlib import Path

import duckdb
import pyarrow as pa

from cricker.venues import canonical

SCHEMA = """
CREATE TABLE IF NOT EXISTS matches (
    match_id      VARCHAR PRIMARY KEY,
    match_type    VARCHAR,
    gender        VARCHAR,
    team_type     VARCHAR,
    start_date    DATE,
    end_date      DATE,
    venue         VARCHAR,   -- Cricsheet's spelling
    city          VARCHAR,
    venue_id      VARCHAR,   -- one id per ground across spellings and renames
    venue_name    VARCHAR,
    country       VARCHAR,   -- host country, NULL when the ground is unknown
    team1         VARCHAR,
    team2         VARCHAR,
    toss_winner   VARCHAR,
    toss_decision VARCHAR,
    winner        VARCHAR,
    result        VARCHAR,   -- draw, tie, no result; NULL when there's a winner
    won_by_runs   INTEGER,
    won_by_wickets INTEGER,
    won_by_innings BOOLEAN,
    method        VARCHAR,
    event_name    VARCHAR,
    match_number  INTEGER,
    season        VARCHAR,
    player_of_match VARCHAR,
    data_version  VARCHAR,
    revision      INTEGER
);

CREATE TABLE IF NOT EXISTS people (
    person_id    VARCHAR PRIMARY KEY,
    name         VARCHAR,   -- Cricsheet's name, e.g. 'TM Head'
    display_name VARCHAR    -- e.g. 'Travis Head'
);

CREATE TABLE IF NOT EXISTS match_players (
    match_id  VARCHAR,
    team      VARCHAR,
    person_id VARCHAR
);

CREATE TABLE IF NOT EXISTS innings (
    match_id     VARCHAR,
    innings      INTEGER,
    batting_team VARCHAR,
    declared     BOOLEAN,
    forfeited    BOOLEAN
);

CREATE TABLE IF NOT EXISTS deliveries (
    match_id       VARCHAR,
    innings        INTEGER,
    batting_team   VARCHAR,
    over           INTEGER,
    ball           INTEGER,   -- position in the over, counting wides and no-balls
    batter_id      VARCHAR,
    bowler_id      VARCHAR,
    non_striker_id VARCHAR,
    runs_batter    INTEGER,
    runs_extras    INTEGER,
    runs_total     INTEGER,
    wides          INTEGER,
    noballs        INTEGER,
    byes           INTEGER,
    legbyes        INTEGER,
    wicket_kind    VARCHAR,   -- first wicket on the ball; see dismissals for all
    player_out_id  VARCHAR,
    seq            INTEGER,   -- order within the innings, from 1
    penalty        INTEGER,
    non_boundary   BOOLEAN    -- runs_batter of 4 or 6 that were run, not hit
);

CREATE TABLE IF NOT EXISTS dismissals (
    match_id        VARCHAR,
    innings         INTEGER,
    seq             INTEGER,
    kind            VARCHAR,
    player_out_id   VARCHAR,
    fielders        VARCHAR,  -- comma separated person ids, 'sub' for substitutes
    bowler_credited BOOLEAN
);
"""

# Dismissals credited to the bowler. Run outs, retirements, obstructing the
# field and handled the ball are not.
BOWLER_WICKETS = ("bowled", "caught", "caught and bowled", "lbw", "stumped", "hit wicket")


def load_display_names(path):
    """Read Cricsheet's names.csv register into {person_id: [names]}."""
    names = {}
    if path is None:
        return names
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            names.setdefault(row["identifier"], []).append(row["name"].strip())
    return names


def is_full_name(name):
    first = name.split()[0] if name.split() else ""
    return len(name.split()) > 1 and len(first) > 2 and first != first.upper()


def display_name(cricsheet_name, variants):
    """Pick a readable name: Cricsheet's own if it's already a full name,
    otherwise the shortest full-name variant from the register that keeps
    Cricsheet's surname and first initial ('PJ Cummins' -> 'Pat Cummins',
    not the register's stray 'Anderson Cummins')."""
    if is_full_name(cricsheet_name):
        return cricsheet_name
    parts = cricsheet_name.split()
    full = [
        n for n in variants
        if is_full_name(n) and n.split()[-1] == parts[-1] and n[0] == cricsheet_name[0]
    ]
    return min(full, key=len) if full else cricsheet_name


def parse_match(match_id, data):
    """Turn one Cricsheet match into rows for each table."""
    info = data["info"]
    registry = info.get("registry", {}).get("people", {})
    teams = info.get("teams", [None, None])
    outcome = info.get("outcome", {})
    by = outcome.get("by", {})
    toss = info.get("toss", {})
    event = info.get("event", {})
    venue_id, venue_name, country = canonical(info.get("venue"))
    dates = sorted(info["dates"])

    def pid(name):
        # Cricsheet refers to people by name; the registry gives stable ids.
        return registry.get(name, name)

    match_row = {
        "match_id": match_id,
        "match_type": info.get("match_type"),
        "gender": info.get("gender"),
        "team_type": info.get("team_type"),
        "start_date": dates[0],
        "end_date": dates[-1],
        "venue": info.get("venue"),
        "city": info.get("city"),
        "venue_id": venue_id,
        "venue_name": venue_name,
        "country": country,
        "team1": teams[0],
        "team2": teams[1] if len(teams) > 1 else None,
        "toss_winner": toss.get("winner"),
        "toss_decision": toss.get("decision"),
        "winner": outcome.get("winner"),
        "result": outcome.get("result"),
        "won_by_runs": by.get("runs"),
        "won_by_wickets": by.get("wickets"),
        "won_by_innings": bool(by.get("innings")),
        "method": outcome.get("method"),
        "event_name": event.get("name"),
        "match_number": event.get("match_number"),
        "season": str(info["season"]) if "season" in info else None,
        "player_of_match": ",".join(pid(p) for p in info.get("player_of_match", [])) or None,
        "data_version": data.get("meta", {}).get("data_version"),
        "revision": data.get("meta", {}).get("revision"),
    }
    people_rows = [(pid_, name) for name, pid_ in registry.items()]
    player_rows = [
        {"match_id": match_id, "team": team, "person_id": pid(p)}
        for team, players in info.get("players", {}).items()
        for p in players
    ]

    innings_rows, delivery_rows, dismissal_rows = [], [], []
    for innings_no, innings in enumerate(data.get("innings", []), start=1):
        innings_rows.append({
            "match_id": match_id,
            "innings": innings_no,
            "batting_team": innings.get("team"),
            "declared": bool(innings.get("declared")),
            "forfeited": bool(innings.get("forfeited")),
        })
        seq = 0
        for over in innings.get("overs", []):
            for ball_no, d in enumerate(over["deliveries"], start=1):
                seq += 1
                extras = d.get("extras", {})
                wickets = d.get("wickets") or []
                # deliveries keeps the first wicket for the head-to-head
                # queries; dismissals has every one (a ball can carry two).
                first = wickets[0] if wickets else {}
                delivery_rows.append({
                    "match_id": match_id,
                    "innings": innings_no,
                    "batting_team": innings.get("team"),
                    "over": over["over"],
                    "ball": ball_no,
                    "batter_id": pid(d["batter"]),
                    "bowler_id": pid(d["bowler"]),
                    "non_striker_id": pid(d["non_striker"]),
                    "runs_batter": d["runs"]["batter"],
                    "runs_extras": d["runs"]["extras"],
                    "runs_total": d["runs"]["total"],
                    "wides": extras.get("wides", 0),
                    "noballs": extras.get("noballs", 0),
                    "byes": extras.get("byes", 0),
                    "legbyes": extras.get("legbyes", 0),
                    "wicket_kind": first.get("kind"),
                    "player_out_id": pid(first["player_out"]) if first.get("player_out") else None,
                    "seq": seq,
                    "penalty": extras.get("penalty", 0),
                    "non_boundary": bool(d["runs"].get("non_boundary")),
                })
                for w in wickets:
                    fielders = [
                        "sub" if f.get("substitute") else pid(f["name"])
                        for f in w.get("fielders", []) if f.get("name") or f.get("substitute")
                    ]
                    dismissal_rows.append({
                        "match_id": match_id,
                        "innings": innings_no,
                        "seq": seq,
                        "kind": w["kind"],
                        "player_out_id": pid(w["player_out"]),
                        "fielders": ",".join(fielders) or None,
                        "bowler_credited": w["kind"] in BOWLER_WICKETS,
                    })
    return {
        "matches": [match_row],
        "people": people_rows,
        "match_players": player_rows,
        "innings": innings_rows,
        "deliveries": delivery_rows,
        "dismissals": dismissal_rows,
    }


def ingest(source_dir, db_path, names_csv=None):
    con = duckdb.connect(str(db_path))
    con.execute(SCHEMA)
    existing = {r[0] for r in con.execute("SELECT match_id FROM matches").fetchall()}
    variants = load_display_names(names_csv)
    tables = {t: [] for t in ("matches", "match_players", "innings", "deliveries", "dismissals")}
    people = {}
    for path in sorted(Path(source_dir).glob("*.json")):
        match_id = path.stem
        if match_id in existing:
            continue
        rows = parse_match(match_id, json.loads(path.read_text()))
        for table in tables:
            tables[table].extend(rows[table])
        people.update(rows["people"])
    tables["people"] = [
        {"person_id": p, "name": n, "display_name": display_name(n, variants.get(p, []))}
        for p, n in people.items()
    ]

    # Row-by-row inserts take minutes for the full Test set; load each
    # table in one go through Arrow instead.
    con.execute("BEGIN")
    for table, rows in tables.items():
        if not rows:
            continue
        columns = [c[0] for c in con.execute(f"DESCRIBE {table}").fetchall()]
        batch = pa.table({c: [r[c] for r in rows] for c in columns})  # noqa: F841
        verb = "INSERT OR IGNORE" if table == "people" else "INSERT"
        con.execute(f"{verb} INTO {table} SELECT * FROM batch")
    con.execute("COMMIT")
    con.close()
    return len(tables["matches"])


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source_dir", help="directory of Cricsheet JSON files")
    parser.add_argument("db_path", help="DuckDB file to create or update")
    parser.add_argument("--names", help="Cricsheet names.csv register, for display names")
    args = parser.parse_args()
    print(f"Added {ingest(args.source_dir, args.db_path, args.names)} matches")


if __name__ == "__main__":
    main()
