import { describe, expect, it } from "vitest";
import { averageRange, average, edge, evidence, poissonInterval, strikeRate } from "../src/engine/definitions";
import { buildTimeline } from "../src/engine/replay";
import { batAgg, bowlAgg, currentRows, h2hAgg, meetings, scopes } from "../src/engine/stats";
import { comparable, envelope, groundRecord, totals } from "../src/engine/context";
import { load } from "./load";

const b = load("1426557");
const t = buildTimeline(b);
const HEAD = "12b610c2";
const BUMRAH = "462411b3";
const scope = (id: string) => scopes(b).find((s) => s.id === id)!;

describe("definitions", () => {
  it("never invents an average or strike rate", () => {
    expect(average(40, 0)).toBeNull();
    expect(strikeRate(0, 0)).toBeNull();
    expect(average(40, 2)).toBe(20);
  });

  it("uses exact Poisson intervals", () => {
    const [lo0, hi0] = poissonInterval(0);
    expect(lo0).toBe(0);
    expect(hi0).toBeCloseTo(2.9957, 3);
    const [lo5, hi5] = poissonInterval(5);
    expect(lo5).toBeCloseTo(1.9701, 3);
    expect(hi5).toBeCloseTo(10.5130, 3);
  });

  it("gives an open-ended range when the batter was never out", () => {
    const r = averageRange(60, 90, 0)!;
    expect(r.high).toBeNull();
    expect(r.low).toBeCloseTo(60 / 2.9957, 2);
  });

  it("grades evidence by dismissals and balls", () => {
    expect(evidence(0, 0)).toBe("none");
    expect(evidence(30, 1)).toBe("very-thin");
    expect(evidence(300, 0)).toBe("thin");
    expect(evidence(500, 12)).toBe("moderate");
  });

  it("only calls an edge when the whole range clears the baseline", () => {
    expect(edge(averageRange(20, 100, 2), 45, 100, 2)).toBe("insufficient");
    expect(edge(averageRange(200, 600, 20), 45, 600, 20)).toBe("bowler");
    expect(edge(averageRange(900, 1500, 10), 45, 1500, 10)).toBe("batter");
    expect(edge(averageRange(450, 900, 10), 45, 900, 10)).toBe("even");
  });
});

describe("scopes", () => {
  const start = currentRows(t, 0);
  const end = currentRows(t, t.balls.length - 1);

  it("keeps 'before this match' fixed as the replay moves", () => {
    expect(h2hAgg(b, start, HEAD, BUMRAH, scope("before"))).toEqual(h2hAgg(b, end, HEAD, BUMRAH, scope("before")));
  });

  it("adds this match only up to the cursor", () => {
    const before = h2hAgg(b, end, HEAD, BUMRAH, scope("before"));
    const match = h2hAgg(b, end, HEAD, BUMRAH, scope("match"));
    const career = h2hAgg(b, end, HEAD, BUMRAH, scope("career"));
    expect(career.balls).toBe(before.balls + match.balls);
    expect(career.outs).toBe(before.outs + match.outs);
    expect(h2hAgg(b, start, HEAD, BUMRAH, scope("match")).balls).toBe(0);
  });

  it("matches Head v Bumrah from the deliveries", () => {
    // Before the Gabba: 180 balls, 92 runs, 3 dismissals across 7 Tests.
    const before = h2hAgg(b, start, HEAD, BUMRAH, scope("before"));
    expect([before.balls, before.runs, before.outs, before.matches]).toEqual([180, 92, 3, 7]);
    // This series: Perth and Adelaide only, no later Tests.
    const series = h2hAgg(b, start, HEAD, BUMRAH, scope("series"));
    expect(series.matches).toBe(2);
    const m = meetings(b, end, HEAD, BUMRAH);
    expect(m.every((x) => x.date <= b.match.dates[0])).toBe(true);
    expect(m[m.length - 1].current).toBe(true);
  });

  it("holds no history from this match or later", () => {
    for (const m of Object.values(b.history.matches)) expect(m.date < b.match.dates[0]).toBe(true);
  });

  it("aggregates a batter's career before the match", () => {
    const head = batAgg(b, start, HEAD, scope("before"));
    expect(head.runs).toBeGreaterThan(3000);
    const bowlerOnly = batAgg(b, start, HEAD, scope("before"), "bowler");
    expect(bowlerOnly.outs).toBeLessThanOrEqual(head.outs);
    const bumrah = bowlAgg(b, start, BUMRAH, scope("before"));
    expect(bumrah.wickets).toBeGreaterThan(150);
  });
});

describe("ground context", () => {
  it("summarises first-innings totals at the Gabba", () => {
    const firsts = totals(b, b.history.venue, 1);
    expect(firsts.length).toBe(20) // Gabba Tests in Cricsheet before Dec 2024;
    expect(firsts.every((x) => x.runs > 0)).toBe(true);
  });

  it("builds an envelope that never thins below the minimum", () => {
    const env = envelope(b.history.venue, 1);
    expect(env.every((p) => p.n >= 6 || p.over === 0)).toBe(true);
    expect(env[10].p25).toBeLessThanOrEqual(env[10].p50);
  });

  it("finds comparable situations", () => {
    const c = comparable(b, b.history.country, 1, 30, 100, 3);
    expect(c.n).toBeGreaterThan(5);
    expect(c.median).not.toBeNull();
  });

  it("records results at the ground", () => {
    const r = groundRecord(b);
    expect(r.tests).toBe(20);
    expect(r.batFirstWon + r.batFirstLost + r.draws).toBeLessThanOrEqual(r.tests);
  });
});
