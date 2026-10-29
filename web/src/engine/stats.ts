// Aggregates over time windows ("scopes") that combine history from the
// bundle with this match up to the replay cursor.
import type { BatRow, BowlRow, Bundle, H2HRow, HistoryMatch } from "./types";
import type { Timeline } from "./replay";
import { BOWLER_WICKETS, NOT_OUT_KINDS, emptyBat, emptyBowl, type BatAgg, type BowlAgg } from "./definitions";

export interface CurrentRows {
  h2h: Map<string, H2HRow[]>;
  batting: Map<string, BatRow[]>;
  bowling: Map<string, BowlRow[]>;
}

// This match's rows, built from deliveries 0..cursor only, in the same
// layout bundle.py uses for history.
export function currentRows(t: Timeline, cursor: number): CurrentRows {
  const id = t.bundle.match.id;
  const h2h = new Map<string, H2HRow>();
  const bat = new Map<string, BatRow>();
  const bowl = new Map<string, BowlRow>();
  const batRow = (p: string, inn: number) => {
    const k = `${p}|${inn}`;
    let r = bat.get(k);
    if (!r) {
      r = [id, inn, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      bat.set(k, r);
    }
    return r;
  };
  for (let g = 0; g <= cursor && g < t.balls.length; g++) {
    const d = t.balls[g];
    // Offset of the scoring-shot counter in an h2h row (ones..sixes); a 4 or
    // 6 that was run rather than hit only adds to runs.
    const shot = d.rb >= 1 && d.rb <= 3 ? 5 + d.rb : !d.nbd && d.rb === 4 ? 9 : !d.nbd && d.rb === 6 ? 10 : -1;
    const credited = (d.w ?? []).some((w) => BOWLER_WICKETS.has(w.k) && w.out === d.bat);

    const hk = `${d.bat}|${d.bowl}|${d.inn}`;
    let h = h2h.get(hk);
    if (!h) {
      h = [id, d.inn, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      h2h.set(hk, h);
    }
    if (d.faced) h[2]++;
    h[3] += d.rb;
    if (credited) h[4]++;
    if (d.faced && d.rb === 0) h[5]++;
    if (shot > 0) h[shot] = (h[shot] as number) + 1;

    const r = batRow(d.bat, d.inn);
    batRow(d.ns, d.inn);
    if (d.faced) r[2]++;
    r[3] += d.rb;
    if (d.faced && d.rb === 0) r[6]++;
    if (shot > 0) r[shot + 1] = (r[shot + 1] as number) + 1;
    for (const w of d.w ?? []) {
      if (NOT_OUT_KINDS.has(w.k)) continue;
      const o = batRow(w.out, d.inn);
      o[4]++;
      if (BOWLER_WICKETS.has(w.k)) o[5]++;
    }

    const bk = `${d.bowl}|${d.inn}`;
    let b = bowl.get(bk);
    if (!b) {
      b = [id, d.inn, 0, 0, 0, 0];
      bowl.set(bk, b);
    }
    if (d.legal) b[2]++;
    b[3] += d.conceded;
    if (credited) b[4]++;
    if (d.legal && d.conceded === 0) b[5]++;
  }
  const group = <R>(m: Map<string, R>, parts: number) => {
    const out = new Map<string, R[]>();
    for (const [k, v] of m) {
      const key = k.split("|").slice(0, parts).join("|");
      out.set(key, [...(out.get(key) ?? []), v]);
    }
    return out;
  };
  return { h2h: group(h2h, 2), batting: group(bat, 1), bowling: group(bowl, 1) };
}

// --- Scopes ----------------------------------------------------------------

export type ScopeId = "career" | "before" | "series" | "match" | "last24" | "country" | "venue";

export interface Scope {
  id: ScopeId;
  label: string;
  hint: string;
  current: boolean; // includes this match so far
  prior: (m: HistoryMatch) => boolean;
}

export function scopes(b: Bundle): Scope[] {
  const m = b.match;
  const start = m.dates[0];
  const twoYears = new Date(start);
  twoYears.setFullYear(twoYears.getFullYear() - 2);
  const since = twoYears.toISOString().slice(0, 10);
  const venue = shortVenue(m.venue.name);
  const list: Scope[] = [
    { id: "career", label: "Career", hint: "All Tests in the data, including this match up to the selected ball", current: true, prior: () => true },
    { id: "before", label: "Before this match", hint: `Tests that started before ${fmtDate(start)}; nothing from this match`, current: false, prior: () => true },
    { id: "series", label: "This series", hint: "Earlier Tests in this series plus this match so far", current: true, prior: (h) => !!m.series.key && h.series === m.series.key },
    { id: "match", label: "This match", hint: "This match up to the selected ball", current: true, prior: () => false },
    { id: "last24", label: "Last 2 years", hint: `Tests since ${fmtDate(since)} plus this match so far`, current: true, prior: (h) => h.date >= since },
  ];
  if (m.venue.country) list.push({ id: "country", label: `In ${m.venue.country}`, hint: `Tests in ${m.venue.country} plus this match so far`, current: true, prior: (h) => h.country === m.venue.country });
  list.push({ id: "venue", label: `At ${venue}`, hint: `Tests at ${m.venue.name} plus this match so far`, current: true, prior: (h) => h.venue === m.venue.id });
  return list;
}

export const shortVenue = (name: string) => (name === "Brisbane Cricket Ground" ? "the Gabba" : name.replace(/ (Cricket )?Ground$/, "").replace(/^The /, "the "));

export function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export interface RowFilter {
  innings?: number[]; // match innings numbers to keep
  opponent?: string; // keep matches against this team (needs the player's team)
  team?: string;
}

function keep(b: Bundle, scope: Scope, row: [string, number, ...unknown[]], f: RowFilter = {}) {
  if (f.innings && !f.innings.includes(row[1])) return false;
  const h = b.history.matches[row[0]];
  if (row[0] === b.match.id) {
    if (!scope.current) return false;
    if (f.opponent && f.team) return b.match.teams.includes(f.opponent);
    return true;
  }
  if (!h || !scope.prior(h)) return false;
  if (f.opponent && f.team) return h.teams.includes(f.opponent) && h.teams.includes(f.team);
  return true;
}

export function h2hAgg(b: Bundle, cur: CurrentRows, bat: string, bowl: string, scope: Scope, f: RowFilter = {}): BatAgg {
  const key = `${bat}|${bowl}`;
  const rows = [...(b.history.h2h[key] ?? []), ...(cur.h2h.get(key) ?? [])].filter((r) => keep(b, scope, r, f));
  const a = emptyBat();
  const matches = new Set<string>();
  for (const r of rows) {
    matches.add(r[0]);
    a.innings++;
    a.balls += r[2];
    a.runs += r[3];
    a.outs += r[4];
    a.dots += r[5];
    a.ones += r[6];
    a.twos += r[7];
    a.threes += r[8];
    a.fours += r[9];
    a.sixes += r[10];
  }
  a.matches = matches.size;
  return a;
}

// Batting over a scope. outs = "all" counts every dismissal (the published
// batting average); "bowler" counts only bowler-credited ones, which is the
// like-for-like baseline for a head-to-head.
export function batAgg(b: Bundle, cur: CurrentRows, p: string, scope: Scope, outs: "all" | "bowler" = "all", f: RowFilter = {}): BatAgg {
  const rows = [...(b.history.batting[p] ?? []), ...(cur.batting.get(p) ?? [])].filter((r) => keep(b, scope, r, f));
  const a = emptyBat();
  const matches = new Set<string>();
  for (const r of rows) {
    matches.add(r[0]);
    a.innings++;
    a.balls += r[2];
    a.runs += r[3];
    a.outs += outs === "all" ? r[4] : r[5];
    a.dots += r[6];
    a.ones += r[7];
    a.twos += r[8];
    a.threes += r[9];
    a.fours += r[10];
    a.sixes += r[11];
  }
  a.matches = matches.size;
  return a;
}

export function bowlAgg(b: Bundle, cur: CurrentRows, p: string, scope: Scope, f: RowFilter = {}): BowlAgg {
  const rows = [...(b.history.bowling[p] ?? []), ...(cur.bowling.get(p) ?? [])].filter((r) => keep(b, scope, r, f));
  const a = emptyBowl();
  const matches = new Set<string>();
  for (const r of rows) {
    matches.add(r[0]);
    if (r[2] > 0 || r[3] > 0) a.innings++;
    a.balls += r[2];
    a.runs += r[3];
    a.wickets += r[4];
    a.dots += r[5];
  }
  a.matches = matches.size;
  return a;
}

// Per-meeting history of a pairing: one entry per match, oldest first, for
// the meetings strip.
export interface Meeting {
  match: string;
  date: string;
  label: string;
  venue: string;
  current: boolean;
  balls: number;
  runs: number;
  outs: number;
}

export function meetings(b: Bundle, cur: CurrentRows, bat: string, bowl: string): Meeting[] {
  const key = `${bat}|${bowl}`;
  const by = new Map<string, Meeting>();
  for (const r of [...(b.history.h2h[key] ?? []), ...(cur.h2h.get(key) ?? [])]) {
    const isCur = r[0] === b.match.id;
    const h = b.history.matches[r[0]];
    const m = by.get(r[0]) ?? {
      match: r[0],
      date: isCur ? b.match.dates[0] : h.date,
      label: isCur ? "This match" : `${h.city ?? h.venueName.split(" ")[0]} ${h.date.slice(2, 4)}`,
      venue: isCur ? b.match.venue.name : h.venueName,
      current: isCur,
      balls: 0,
      runs: 0,
      outs: 0,
    };
    m.balls += r[2];
    m.runs += r[3];
    m.outs += r[4];
    by.set(r[0], m);
  }
  return [...by.values()].sort((x, y) => x.date.localeCompare(y.date));
}
