// Ground and country context: how the current innings compares with
// innings that have gone before. Everything here is observed history; nothing
// is projected.
import type { Bundle, TeamInningsRow } from "./types";

export interface Total {
  match: string;
  date: string;
  team: string;
  runs: number;
  wickets: number;
  declared: boolean;
  allOut: boolean;
}

export function totals(b: Bundle, rows: TeamInningsRow[], innings: number): Total[] {
  return rows
    .filter((r) => r[1] === innings)
    .map((r) => ({
      match: r[0],
      date: b.history.matches[r[0]]?.date ?? "",
      team: r[2],
      runs: r[3],
      wickets: r[4],
      declared: r[6],
      allOut: r[4] >= 10,
    }));
}

export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface EnvelopePoint {
  over: number; // end of this over
  n: number; // innings still going at this point
  p25: number;
  p50: number;
  p75: number;
}

// Runs at the end of each over across past innings, among innings that were
// still going. Thins out late in an innings, so points under minN are dropped.
export function envelope(rows: TeamInningsRow[], innings: number, minN = 6): EnvelopePoint[] {
  const cums = rows.filter((r) => r[1] === innings).map((r) => r[7]);
  const longest = Math.max(0, ...cums.map((c) => c.length));
  const out: EnvelopePoint[] = [{ over: 0, n: cums.length, p25: 0, p50: 0, p75: 0 }];
  for (let k = 1; k <= longest; k++) {
    // An innings with k complete overs has cum[k - 1]; the last entry may be a part over.
    const vals = cums.filter((c) => c.length >= k).map((c) => c[k - 1]).sort((a, b) => a - b);
    if (vals.length < minN) break;
    out.push({ over: k, n: vals.length, p25: quantile(vals, 0.25)!, p50: quantile(vals, 0.5)!, p75: quantile(vals, 0.75)! });
  }
  return out;
}

export interface Comparable {
  n: number;
  finals: Total[];
  median: number | null;
  p25: number | null;
  p75: number | null;
  declared: number;
}

// Past innings with the same number that, at the same over, had lost the same
// number of wickets (give or take one) and were within 25 runs. What did they
// end up with? A descriptive lookup, not a forecast.
export function comparable(b: Bundle, rows: TeamInningsRow[], innings: number, overs: number, runs: number, wickets: number): Comparable {
  const finals: Total[] = [];
  for (const r of rows) {
    if (r[1] !== innings || overs < 1 || r[7].length < overs) continue;
    const at = r[7][overs - 1];
    const wk = r[8].filter((x) => x <= overs).length;
    if (Math.abs(at - runs) <= 25 && Math.abs(wk - wickets) <= 1) {
      finals.push({ match: r[0], date: b.history.matches[r[0]]?.date ?? "", team: r[2], runs: r[3], wickets: r[4], declared: r[6], allOut: r[4] >= 10 });
    }
  }
  const v = finals.map((f) => f.runs).sort((a, b) => a - b);
  return { n: finals.length, finals, median: quantile(v, 0.5), p25: quantile(v, 0.25), p75: quantile(v, 0.75), declared: finals.filter((f) => f.declared).length };
}

export interface GroundRecord {
  tests: number;
  from: string | null;
  to: string | null;
  draws: number;
  batFirstWon: number;
  batFirstLost: number;
  tossBat: number;
  tossWinnerWon: number;
  chasesWon: number;
  chasesTried: number; // 4th innings that ended in a win or loss for the chasing side
  highestChase: { runs: number; team: string; date: string } | null;
}

export function groundRecord(b: Bundle): GroundRecord {
  const ids = [...new Set(b.history.venue.map((r) => r[0]))];
  const ms = ids.map((id) => ({ id, ...b.history.matches[id] })).sort((x, y) => x.date.localeCompare(y.date));
  const rec: GroundRecord = {
    tests: ms.length, from: ms[0]?.date ?? null, to: ms[ms.length - 1]?.date ?? null,
    draws: 0, batFirstWon: 0, batFirstLost: 0, tossBat: 0, tossWinnerWon: 0, chasesWon: 0, chasesTried: 0, highestChase: null,
  };
  for (const m of ms) {
    if (m.result === "draw") rec.draws++;
    const first = m.inns[0];
    if (m.winner && first) m.winner === first ? rec.batFirstWon++ : rec.batFirstLost++;
    if (m.toss[1] === "bat") rec.tossBat++;
    if (m.winner && m.toss[0] === m.winner) rec.tossWinnerWon++;
    const fourth = b.history.venue.find((r) => r[0] === m.id && r[1] === 4);
    if (fourth && m.winner) {
      rec.chasesTried++;
      if (m.winner === fourth[2]) {
        rec.chasesWon++;
        if (!rec.highestChase || fourth[3] > rec.highestChase.runs) rec.highestChase = { runs: fourth[3], team: fourth[2], date: m.date };
      }
    }
  }
  return rec;
}
