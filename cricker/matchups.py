"""Batter vs bowler head-to-head stats.

    cricker-matchup data/cricker.duckdb "TM Head" "JJ Bumrah"
"""

import argparse

import duckdb

# Dismissals credited to the bowler; run outs and the like don't count
# against a bowler in a head-to-head.
BOWLER_WICKETS = ("bowled", "caught", "caught and bowled", "lbw", "stumped", "hit wicket")

MATCHUP_SQL = f"""
SELECT
    count(*) FILTER (WHERE d.wides = 0)                     AS balls,
    coalesce(sum(d.runs_batter), 0)                         AS runs,
    count(*) FILTER (WHERE d.wicket_kind IN {BOWLER_WICKETS}
                     AND d.player_out_id = d.batter_id)     AS dismissals,
    count(*) FILTER (WHERE d.wides = 0 AND d.runs_batter = 0
                     AND d.wicket_kind IS NULL)             AS dots,
    count(*) FILTER (WHERE d.runs_batter = 4)               AS fours,
    count(*) FILTER (WHERE d.runs_batter = 6)               AS sixes,
    count(DISTINCT d.match_id)                              AS matches
FROM deliveries d
JOIN matches m USING (match_id)
WHERE d.batter_id = $batter AND d.bowler_id = $bowler
  AND ($match_type IS NULL OR m.match_type = $match_type)
"""


def find_person(con, name):
    rows = con.execute(
        "SELECT person_id, name FROM people WHERE name = ? OR person_id = ?", [name, name]
    ).fetchall()
    if not rows:
        raise LookupError(f"No player named {name!r}")
    return rows[0][0]


def matchup(con, batter, bowler, match_type="Test"):
    params = {
        "batter": find_person(con, batter),
        "bowler": find_person(con, bowler),
        "match_type": match_type,
    }
    balls, runs, dismissals, dots, fours, sixes, matches = con.execute(
        MATCHUP_SQL, params
    ).fetchone()
    return {
        "balls": balls,
        "runs": runs,
        "dismissals": dismissals,
        "average": round(runs / dismissals, 2) if dismissals else None,
        "strike_rate": round(100 * runs / balls, 2) if balls else None,
        "dot_pct": round(100 * dots / balls, 1) if balls else None,
        "fours": fours,
        "sixes": sixes,
        "matches": matches,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("db_path")
    parser.add_argument("batter", help="Cricsheet name, e.g. 'TM Head'")
    parser.add_argument("bowler", help="Cricsheet name, e.g. 'JJ Bumrah'")
    parser.add_argument("--format", default="Test", help="match type, or 'all'")
    args = parser.parse_args()
    con = duckdb.connect(args.db_path, read_only=True)
    match_type = None if args.format == "all" else args.format
    for key, value in matchup(con, args.batter, args.bowler, match_type).items():
        print(f"{key:>12}: {value}")


if __name__ == "__main__":
    main()
