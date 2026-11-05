"""Converter tests on a hand-built fixture in the shape of Sportmonks' documented
response. Field names follow their docs; the outcome names must be re-checked
against a real match during the trial."""

import json

import pytest

from cricker import sportmonks
from cricker.sportmonks import Poller, ball_key, convert_fixture, wicket_kind


def score(name, runs=0, **kw):
    return {"name": name, "runs": runs, "bye": 0, "leg_bye": 0, "noball": 0,
            "noball_runs": 0, "is_wicket": False, **kw}


def ball(id, b, sc, bat=1, ns=2, bowl=11, board="S1", team=100, **kw):
    return {"id": id, "ball": b, "scoreboard": board, "team_id": team, "batsman_id": bat,
            "batsman_one_on_creeze_id": bat, "batsman_two_on_creeze_id": ns, "bowler_id": bowl,
            "score": sc, "updated_at": "2026-11-05T10:00:00.000000Z", **kw}


FIXTURE = {
    "status": "1st Innings",
    "localteam": {"id": 100, "name": "West Indies"},
    "visitorteam": {"id": 200, "name": "Bangladesh"},
    "lineup": [{"id": 1, "fullname": "Kraigg Brathwaite", "firstname": "Kraigg", "lastname": "Brathwaite"}],
    "balls": {"data": [
        ball(1, 0.1, score("4 Runs", 4, four=True)),
        ball(2, 0.2, score("1 Wide", 1)),
        ball(3, 0.2, score("2 Leg Byes", 2, leg_bye=2)),
        ball(4, 0.3, score("No Ball", 1, noball=1, noball_runs=4)),
        ball(5, 0.3, score("Catch Out", 0, is_wicket=True), catchstump_id=12, batsmanout_id=1),
        ball(6, 1.1, score("0 Run"), bat=2, ns=3, bowl=13),
        ball(7, 0.1, score("1 Run", 1), board="S2", team=200, bat=21, ns=22, bowl=31),
    ]},
}


def pid(x):
    return x and f"p{x}"


def test_ball_key():
    assert ball_key(34.2) == (34, 2)
    assert ball_key("0.1") == (0, 1)


@pytest.mark.parametrize("name,kind", [
    ("Catch Out", "caught"), ("Clean Bowled", "bowled"), ("LBW OUT", "lbw"),
    ("Run Out", "run out"), ("Stump Out", "stumped"), ("Caught and Bowled", "caught and bowled"),
    ("6 Runs", None),
])
def test_wicket_kind(name, kind):
    assert wicket_kind(name) == kind


def test_convert_fixture():
    innings, by_id, problems = convert_fixture(FIXTURE, pid)
    assert problems == []
    assert [i["team"] for i in innings] == ["West Indies", "Bangladesh"]
    first = innings[0]["balls"]
    assert first[0] == {"o": 0, "bat": "p1", "bowl": "p11", "ns": "p2", "rb": 4}
    assert first[1] == {"o": 0, "bat": "p1", "bowl": "p11", "ns": "p2", "rb": 0, "wd": 1}
    assert first[2]["lb"] == 2 and first[2]["rb"] == 0
    assert first[3]["nb"] == 1 and first[3]["rb"] == 4
    assert first[4]["w"] == [{"k": "caught", "out": "p1", "f": ["p12"]}]
    assert first[5]["o"] == 1 and first[5]["bowl"] == "p13"
    assert len(innings[1]["balls"]) == 1


def test_unknown_wicket_outcome_is_reported_not_guessed():
    fx = {"balls": [ball(1, 0.1, score("Handled Ball", 0, is_wicket=True))]}
    innings, _, problems = convert_fixture(fx, pid)
    assert innings[0]["balls"][0]["w"][0]["k"] == "Handled Ball"
    assert "unknown wicket outcome" in problems[0]


def test_poller_logs_new_balls_and_corrections(tmp_path, monkeypatch):
    responses = [json.loads(json.dumps(FIXTURE)) for _ in range(2)]
    # Second poll: the opening four is changed to four leg byes.
    responses[1]["balls"]["data"][0]["score"] = score("4 Leg Byes", 4, leg_bye=4)
    monkeypatch.setattr(sportmonks, "fetch_fixture", lambda token, fid: responses.pop(0))
    p = Poller("t", "99", tmp_path, lambda player: "brathwaite-id", tmp_path / "players.json")
    p.poll_once()
    p.poll_once()
    log = [json.loads(line) for line in (tmp_path / "99.log.jsonl").read_text().splitlines()]
    assert sum(r["event"] == "ball" for r in log) == 7
    corrections = [r for r in log if r["event"] == "correction"]
    assert len(corrections) == 1 and corrections[0]["after"]["lb"] == 4
    out = json.loads((tmp_path / "99.json").read_text())
    assert out["innings"][0]["balls"][0]["bat"] == "brathwaite-id"
    assert json.loads((tmp_path / "players.json").read_text()) == {"1": "brathwaite-id"}
