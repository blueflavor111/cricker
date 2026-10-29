import copy
import json
from pathlib import Path

import duckdb
import pytest

from cricker.bundle import build
from cricker.ingest import display_name, ingest
from cricker.matchups import matchup
from cricker.venues import canonical

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "1.json").read_text())


@pytest.mark.parametrize("raw,expected", [
    ("Brisbane Cricket Ground", ("brisbane-cricket-ground", "Brisbane Cricket Ground", "Australia")),
    ("Brisbane Cricket Ground, Woolloongabba, Brisbane", ("brisbane-cricket-ground", "Brisbane Cricket Ground", "Australia")),
    ("Feroz Shah Kotla", ("arun-jaitley-stadium", "Arun Jaitley Stadium", "India")),
    ("W.A.C.A. Ground", ("waca-ground", "WACA Ground", "Australia")),
    ("The Village, Malahide", ("the-village-malahide", "The Village, Malahide", "Ireland")),
    ("Test Ground", ("test-ground", "Test Ground", None)),
])
def test_venue_canonical(raw, expected):
    assert canonical(raw) == expected


def test_display_name_keeps_surname_and_initial():
    assert display_name("PJ Cummins", ["Pat Cummins", "Anderson Cummins", "P Cummins"]) == "Pat Cummins"
    assert display_name("SPD Smith", ["Steve Smith", "Steven Smith"]) == "Steve Smith"
    assert display_name("Mohammed Siraj", ["Md Siraj"]) == "Mohammed Siraj"
    assert display_name("KL Rahul", ["K L Rahul"]) == "KL Rahul"


@pytest.fixture
def two_matches(tmp_path):
    """The fixture Test, and a copy of it played a month later."""
    raw = tmp_path / "raw"
    raw.mkdir()
    first = copy.deepcopy(FIXTURE)
    first["info"]["players"] = {"Australia": ["TM Head", "SPD Smith"], "India": ["JJ Bumrah", "Mohammed Siraj"]}
    second = copy.deepcopy(first)
    second["info"]["dates"] = ["2025-01-14"]
    (raw / "1.json").write_text(json.dumps(first))
    (raw / "2.json").write_text(json.dumps(second))
    db = tmp_path / "t.duckdb"
    assert ingest(raw, db) == 2
    con = duckdb.connect(str(db))
    yield con, raw
    con.close()


def test_dismissals_keep_fielders_and_credit(two_matches):
    con, _ = two_matches
    rows = con.execute(
        "SELECT kind, player_out_id, fielders, bowler_credited FROM dismissals WHERE match_id = '1'"
    ).fetchall()
    assert ("caught", "aaaa0001", "RR Pant", True) in rows


def test_bundle_history_stops_before_the_match(two_matches):
    con, raw = two_matches
    first = build(con, raw, "1")
    assert first["history"]["matches"] == {}
    assert first["history"]["h2h"] == {}

    second = build(con, raw, "2")
    assert set(second["history"]["matches"]) == {"1"}
    rows = second["history"]["h2h"]["aaaa0001|bbbb0001"]
    balls = sum(r[2] for r in rows)
    runs = sum(r[3] for r in rows)
    outs = sum(r[4] for r in rows)
    # The bundle's history agrees with the CLI's head-to-head for match 1 alone.
    con.execute("DELETE FROM deliveries WHERE match_id = '2'")
    m = matchup(con, "TM Head", "JJ Bumrah")
    assert (balls, runs, outs) == (m["balls"], m["runs"], m["dismissals"])


def test_bundle_events_round_trip(two_matches):
    con, raw = two_matches
    b = build(con, raw, "1")
    first_innings = b["innings"][0]["balls"]
    assert sum(e["rb"] + e.get("wd", 0) + e.get("nb", 0) + e.get("b", 0) + e.get("lb", 0)
               for e in first_innings) == sum(
        d["runs"]["total"] for o in FIXTURE["innings"][0]["overs"] for d in o["deliveries"])
    wicket = next(e for e in first_innings if "w" in e)
    assert wicket["w"][0] == {"k": "caught", "out": "aaaa0001", "f": ["RR Pant"]}
