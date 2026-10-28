"""Load Cricsheet JSON match files into a DuckDB database.

Download the data first, e.g. https://cricsheet.org/downloads/tests_json.zip,
unzip it into a directory, then run:

    cricker-ingest data/raw/tests data/cricker.duckdb
"""

import argparse
import json
from pathlib import Path

import duckdb

SCHEMA = """
CREATE TABLE IF NOT EXISTS matches (
    match_id    VARCHAR PRIMARY KEY,
    match_type  VARCHAR,
    start_date  DATE,
    venue       VARCHAR,
    city        VARCHAR,
    team1       VARCHAR,
    team2       VARCHAR,
    toss_winner VARCHAR,
    toss_decision VARCHAR,
    winner      VARCHAR,
    result      VARCHAR
);

CREATE TABLE IF NOT EXISTS people (
    person_id VARCHAR PRIMARY KEY,
    name      VARCHAR
);

CREATE TABLE IF NOT EXISTS deliveries (
    match_id       VARCHAR,
    innings        INTEGER,
    batting_team   VARCHAR,
    over           INTEGER,
    ball           INTEGER,
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
    wicket_kind    VARCHAR,
    player_out_id  VARCHAR
);
"""


def parse_match(match_id, data):
    """Turn one Cricsheet match into (match_row, people_rows, delivery_rows)."""
    info = data["info"]
    registry = info.get("registry", {}).get("people", {})
    teams = info.get("teams", [None, None])
    outcome = info.get("outcome", {})
    toss = info.get("toss", {})

    match_row = (
        match_id,
        info.get("match_type"),
        info["dates"][0],
        info.get("venue"),
        info.get("city"),
        teams[0],
        teams[1] if len(teams) > 1 else None,
        toss.get("winner"),
        toss.get("decision"),
        outcome.get("winner"),
        outcome.get("result"),
    )
    people_rows = [(pid, name) for name, pid in registry.items()]

    def pid(name):
        # Cricsheet refers to people by name; the registry gives stable ids.
        return registry.get(name, name)

    delivery_rows = []
    for innings_no, innings in enumerate(data.get("innings", []), start=1):
        for over in innings.get("overs", []):
            for ball_no, d in enumerate(over["deliveries"], start=1):
                extras = d.get("extras", {})
                # Cricsheet allows several wickets on one ball (e.g. a run out
                # off a stumping attempt); the striker's dismissal is what a
                # matchup cares about, so keep the first.
                wicket = (d.get("wickets") or [{}])[0]
                delivery_rows.append((
                    match_id,
                    innings_no,
                    innings.get("team"),
                    over["over"],
                    ball_no,
                    pid(d["batter"]),
                    pid(d["bowler"]),
                    pid(d["non_striker"]),
                    d["runs"]["batter"],
                    d["runs"]["extras"],
                    d["runs"]["total"],
                    extras.get("wides", 0),
                    extras.get("noballs", 0),
                    extras.get("byes", 0),
                    extras.get("legbyes", 0),
                    wicket.get("kind"),
                    pid(wicket["player_out"]) if wicket.get("player_out") else None,
                ))
    return match_row, people_rows, delivery_rows


def ingest(source_dir, db_path):
    con = duckdb.connect(str(db_path))
    con.execute(SCHEMA)
    existing = {r[0] for r in con.execute("SELECT match_id FROM matches").fetchall()}
    added = 0
    for path in sorted(Path(source_dir).glob("*.json")):
        match_id = path.stem
        if match_id in existing:
            continue
        match_row, people_rows, delivery_rows = parse_match(
            match_id, json.loads(path.read_text())
        )
        con.execute("BEGIN")
        con.execute("INSERT INTO matches VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", match_row)
        if people_rows:
            con.executemany("INSERT OR IGNORE INTO people VALUES (?, ?)", people_rows)
        if delivery_rows:
            con.executemany(
                "INSERT INTO deliveries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                delivery_rows,
            )
        con.execute("COMMIT")
        added += 1
    con.close()
    return added


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source_dir", help="directory of Cricsheet JSON files")
    parser.add_argument("db_path", help="DuckDB file to create or update")
    args = parser.parse_args()
    print(f"Added {ingest(args.source_dir, args.db_path)} matches")


if __name__ == "__main__":
    main()
