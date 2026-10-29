import { describe, expect, it } from "vitest";
import { buildTimeline, moments, oversText, stateAt } from "../src/engine/replay";
import { load } from "./load";

const gabba = buildTimeline(load("1426557"));
const end = gabba.balls.length - 1;
const name = (id: string) => gabba.bundle.people[id].display;
const findBatter = (s: ReturnType<typeof stateAt>, inn: number, who: string) =>
  s.innings[inn - 1].batters.find((b) => name(b.id) === who)!;
const findBowler = (s: ReturnType<typeof stateAt>, inn: number, who: string) =>
  s.innings[inn - 1].bowlers.find((b) => name(b.id) === who)!;

describe("Gabba 2024 scorecard at the final ball", () => {
  const s = stateAt(gabba, end);

  it("matches the published innings totals", () => {
    expect(s.innings.map((i) => [i.team, i.runs, i.wickets, oversText(i.legal), i.declared])).toEqual([
      ["Australia", 445, 10, "117.1", false],
      ["India", 260, 10, "78.5", false],
      ["Australia", 89, 7, "18", true],
      ["India", 8, 0, "2.1", false],
    ]);
    expect(s.status).toBe("final");
  });

  it("matches the published batting figures", () => {
    const head = findBatter(s, 1, "Travis Head");
    expect([head.runs, head.balls, head.fours, head.sixes]).toEqual([152, 160, 18, 0]);
    const smith = findBatter(s, 1, "Steve Smith");
    expect([smith.runs, smith.balls]).toEqual([101, 190]);
    const carey = findBatter(s, 1, "Alex Carey");
    expect([carey.runs, carey.balls]).toEqual([70, 88]);
    expect(findBatter(s, 2, "KL Rahul").runs).toBe(84);
    expect(findBatter(s, 2, "Ravindra Jadeja").runs).toBe(77);
  });

  it("matches the published bowling figures", () => {
    const b = findBowler(s, 1, "Jasprit Bumrah");
    expect([oversText(b.balls), b.runs, b.wickets]).toEqual(["28", 76, 6]);
    // Every innings: bowlers' runs plus byes, leg byes and penalties make the total.
    for (const inn of s.innings) {
      const conceded = inn.bowlers.reduce((a, w) => a + w.runs, 0);
      expect(conceded + inn.extras.b + inn.extras.lb + inn.extras.pen).toBe(inn.runs);
      expect(inn.batters.reduce((a, p) => a + p.runs, 0) + Object.values(inn.extras).reduce((a, x) => a + x, 0)).toBe(inn.runs);
    }
  });

  it("partnerships add up to the innings total", () => {
    for (const inn of s.innings) expect(inn.partnerships.reduce((a, p) => a + p.runs, 0)).toBe(inn.runs);
    const fifth = s.innings[0].partnerships[3];
    expect(fifth.wicket).toBe(4);
    expect(fifth.runs).toBe(241); // Smith and Head
  });
});

describe("state transitions", () => {
  it("never depends on deliveries after the cursor", () => {
    const cursor = 300;
    const before = JSON.stringify(stateAt(gabba, cursor));
    const tampered = buildTimeline(load("1426557"));
    for (const b of tampered.balls.slice(cursor + 1)) {
      b.rb = 6;
      b.w = [{ k: "bowled", out: b.bat, f: [] }];
    }
    expect(JSON.stringify(stateAt({ ...tampered, bundle: gabba.bundle, days: gabba.days }, cursor))).toBe(before);
  });

  it("leaves one batter at the crease after a wicket", () => {
    const g = gabba.balls.findIndex((b) => b.w);
    const s = stateAt(gabba, g);
    expect(s.crease).toHaveLength(1);
    expect(s.striker).toBeNull();
    expect(stateAt(gabba, g + 1).crease).toHaveLength(2);
  });

  it("labels overs across wides and over boundaries", () => {
    const wide = gabba.balls.find((b) => b.wd && b.inn === 1)!;
    const next = gabba.balls[wide.g + 1];
    // A wide takes the number of the next legal ball, like the scorebook.
    if (next.o === wide.o) expect(next.label).toBe(wide.label);
    expect(stateAt(gabba, 5).current.legal).toBe(6);
    expect(gabba.balls[6].label).toBe("1.1");
  });

  it("moves to the next innings with the previous one complete", () => {
    const first = gabba.innings[0];
    expect(stateAt(gabba, first.end).current.complete).toBe(true);
    const s = stateAt(gabba, first.end + 1);
    expect(s.current.n).toBe(2);
    expect(s.innings[0].complete).toBe(true);
    expect(s.current.legal).toBe(1);
    expect(s.lead).toBe(s.current.runs - 445);
  });

  it("empties the crease when an innings is all out or declared, not when the match ends", () => {
    expect(stateAt(gabba, gabba.innings[0].end).crease).toEqual([]);
    expect(stateAt(gabba, gabba.innings[2].end).crease).toEqual([]);
    expect(stateAt(gabba, end).crease.map(name).sort()).toEqual(["KL Rahul", "Yashasvi Bhupendra Jaiswal"]);
  });

  it("sets the fourth-innings target", () => {
    const s = stateAt(gabba, gabba.innings[3].start);
    expect(s.target).toBe(445 + 89 - 260 + 1);
  });

  it("only declares an innings once it has ended", () => {
    const third = gabba.innings[2];
    expect(stateAt(gabba, third.end - 1).current.declared).toBe(false);
    expect(stateAt(gabba, third.end).current.declared).toBe(true);
  });
});

describe("close of play", () => {
  it("places each sourced stumps score on the matching ball", () => {
    expect(gabba.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    const s1 = stateAt(gabba, gabba.days[0].end);
    expect([s1.current.runs, s1.current.wickets, oversText(s1.current.legal), s1.day]).toEqual([28, 0, "13.2", 1]);
    expect(stateAt(gabba, gabba.days[0].end + 1).day).toBe(2);
    const s4 = stateAt(gabba, gabba.days[3].end);
    expect([s4.current.n, s4.current.runs, s4.current.wickets]).toEqual([2, 252, 9]);
  });

  it("drops a marker that disagrees with the ball data", () => {
    const b = load("1426557");
    b.annotations.closeOfPlay![0].score = "30/0";
    expect(buildTimeline(b).days.map((d) => d.day)).toEqual([2, 3, 4, 5]);
  });

  it("has no days when nothing is sourced", () => {
    expect(buildTimeline(load("1426558")).days).toEqual([]);
    expect(stateAt(buildTimeline(load("1426558")), 10).day).toBeNull();
  });
});

describe("moments", () => {
  const ms = moments(gabba, name);
  it("finds the milestones of the innings", () => {
    const text = ms.filter((m) => m.kind === "milestone").map((m) => m.text);
    expect(text).toContain("Travis Head reaches 150");
    expect(text).toContain("Steve Smith reaches 100");
    expect(text).toContain("Jasprit Bumrah takes five");
  });
  it("lists every wicket once, in order", () => {
    const w = ms.filter((m) => m.kind === "wicket");
    expect(w).toHaveLength(10 + 10 + 7);
    expect(ms.map((m) => m.g)).toEqual([...ms.map((m) => m.g)].sort((a, b) => a - b));
  });
});
