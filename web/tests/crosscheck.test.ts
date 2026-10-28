// The Gabba Test is history in the MCG bundle (computed in SQL by
// bundle.py) and the live match in the Gabba bundle (replayed here). Both
// must produce identical rows, or the two stat engines have drifted.
import { describe, expect, it } from "vitest";
import { buildTimeline } from "../src/engine/replay";
import { currentRows } from "../src/engine/stats";
import { load } from "./load";

const gabba = buildTimeline(load("1426557"));
const mcg = load("1426558");
const cur = currentRows(gabba, gabba.balls.length - 1);
const sortRows = <T extends unknown[]>(rows: T[]) => [...rows].sort((a, b) => (a[1] as number) - (b[1] as number));

describe("replay engine agrees with the SQL history", () => {
  const players = Object.values(mcg.squads).flat();

  it("batting rows", () => {
    let checked = 0;
    for (const p of players) {
      const sql = (mcg.history.batting[p] ?? []).filter((r) => r[0] === "1426557");
      const js = cur.batting.get(p) ?? [];
      if (!sql.length && !js.length) continue;
      expect(sortRows(js), p).toEqual(sortRows(sql));
      checked++;
    }
    expect(checked).toBeGreaterThan(15);
  });

  it("bowling rows", () => {
    let checked = 0;
    for (const p of players) {
      const sql = (mcg.history.bowling[p] ?? []).filter((r) => r[0] === "1426557");
      if (!sql.length) continue;
      expect(sortRows(cur.bowling.get(p) ?? []), p).toEqual(sortRows(sql));
      checked++;
    }
    expect(checked).toBeGreaterThan(8);
  });

  it("head-to-head rows", () => {
    let checked = 0;
    for (const [key, rows] of Object.entries(mcg.history.h2h)) {
      const sql = rows.filter((r) => r[0] === "1426557");
      if (!sql.length) continue;
      expect(sortRows(cur.h2h.get(key) ?? []), key).toEqual(sortRows(sql));
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });
});
