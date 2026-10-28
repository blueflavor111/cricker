from pathlib import Path

import duckdb
import pytest

from cricker.ingest import ingest
from cricker.matchups import matchup

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def con(tmp_path):
    db = tmp_path / "test.duckdb"
    assert ingest(FIXTURES, db) == 1
    con = duckdb.connect(str(db))
    yield con
    con.close()


def test_ingest_is_idempotent(tmp_path):
    db = tmp_path / "test.duckdb"
    assert ingest(FIXTURES, db) == 1
    assert ingest(FIXTURES, db) == 0


def test_head_vs_bumrah(con):
    m = matchup(con, "TM Head", "JJ Bumrah")
    # Wide doesn't count as a ball faced; the no-ball does.
    assert m["balls"] == 5
    assert m["runs"] == 10
    assert m["dismissals"] == 1
    assert m["average"] == 10.0
    assert m["strike_rate"] == 200.0
    # Dot balls: no run off the bat on a ball faced. The opening 0, the leg
    # bye and the wicket ball, as scorers count them (docs/DATA.md).
    assert m["dot_pct"] == 60.0
    assert (m["fours"], m["sixes"], m["matches"]) == (1, 1, 1)


def test_run_out_not_credited_to_bowler(con):
    con.execute(
        "UPDATE deliveries SET wicket_kind = 'run out' WHERE wicket_kind = 'caught'"
    )
    assert matchup(con, "TM Head", "JJ Bumrah")["dismissals"] == 0


def test_lookup_by_id_and_format_filter(con):
    assert matchup(con, "aaaa0002", "bbbb0002")["runs"] == 2
    assert matchup(con, "TM Head", "JJ Bumrah", match_type="ODI")["balls"] == 0


def test_unknown_player(con):
    with pytest.raises(LookupError):
        matchup(con, "Nobody", "JJ Bumrah")
