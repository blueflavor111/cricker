// Deterministic match state reconstruction.
//
// The match is a flat list of deliveries. stateAt(timeline, cursor) folds
// deliveries 0..cursor into the full state of the match at that moment, so
// every figure on screen derives from exactly the balls bowled so far and no
// later ball can influence it.
import type { Bundle, CloseOfPlay, Delivery, Wicket } from "./types";
import { BOWLER_WICKETS, NOT_OUT_KINDS } from "./definitions";

export interface Timeline {
  balls: Delivery[];
  innings: { n: number; team: string; declared: boolean; start: number; end: number }[];
  days: { day: number; end: number; source: string }[]; // end = last delivery of the day
  bundle: Bundle;
}

export function buildTimeline(bundle: Bundle): Timeline {
  const balls: Delivery[] = [];
  const innings: Timeline["innings"] = [];
  bundle.innings.forEach((inn, k) => {
    const start = balls.length;
    let legalNo = 0;
    let over = -1;
    let inOver = 0;
    inn.balls.forEach((b, i) => {
      if (b.o !== over) {
        over = b.o;
        inOver = 0;
      }
      const legal = !b.wd && !b.nb;
      const label = `${b.o}.${inOver + 1}`;
      if (legal) {
        legalNo++;
        inOver++;
      }
      const total = b.rb + (b.wd ?? 0) + (b.nb ?? 0) + (b.b ?? 0) + (b.lb ?? 0) + (b.pen ?? 0);
      balls.push({
        ...b,
        g: balls.length,
        inn: k + 1,
        i,
        legal,
        faced: !b.wd,
        legalNo,
        label,
        total,
        conceded: b.rb + (b.wd ?? 0) + (b.nb ?? 0),
      });
    });
    innings.push({ n: k + 1, team: inn.team, declared: inn.declared, start, end: balls.length - 1 });
  });
  const days = resolveDays(bundle.annotations.closeOfPlay ?? [], balls, innings);
  if (bundle.match.complete && balls.length) {
    const last = days.length ? days[days.length - 1].day : 0;
    if (days.length) days.push({ day: last + 1, end: balls.length - 1, source: bundle.source.url });
  }
  return { balls, innings, days, bundle };
}

// Turn curated close-of-play scores into delivery positions. Each marker must
// agree with the ball-by-ball data on overs, runs and wickets, or it's dropped.
function resolveDays(marks: CloseOfPlay[], balls: Delivery[], innings: Timeline["innings"]) {
  const out: Timeline["days"] = [];
  for (const m of marks) {
    const inn = innings[m.innings - 1];
    if (!inn) continue;
    const [wholeOvers, part] = m.overs.split(".").map(Number);
    const legal = wholeOvers * 6 + (part || 0);
    let runs = 0;
    let wkts = 0;
    let end = -1;
    for (let g = inn.start; g <= inn.end; g++) {
      const b = balls[g];
      if (b.legalNo > legal) break;
      runs += b.total;
      wkts += countWickets(b.w);
      if (b.legalNo === legal) end = g;
    }
    if (end >= 0 && `${runs}/${wkts}` === m.score) out.push({ day: m.day, end, source: m.source });
  }
  return out;
}

export const countWickets = (w?: Wicket[]) => (w ?? []).filter((x) => !NOT_OUT_KINDS.has(x.k)).length;

export interface BatterInnings {
  id: string;
  order: number;
  runs: number;
  balls: number;
  dots: number;
  fours: number;
  sixes: number;
  out: { kind: string; bowler: string; fielders: string[]; at: number; label: string } | null;
  retired: string | null;
}

export interface BowlerInnings {
  id: string;
  order: number;
  balls: number; // legal
  runs: number; // conceded: off the bat plus wides and no-balls
  wickets: number;
  dots: number;
  maidens: number;
  wides: number;
  noballs: number;
}

export interface Partnership {
  wicket: number; // which wicket this stand is for (1 = openers)
  a: string;
  b: string;
  runs: number;
  balls: number; // legal balls
  contrib: Record<string, number>;
  start: number;
  end: number;
  broken: boolean;
}

export interface InningsState {
  n: number;
  team: string;
  runs: number;
  wickets: number;
  legal: number;
  extras: { wd: number; nb: number; b: number; lb: number; pen: number };
  batters: BatterInnings[];
  bowlers: BowlerInnings[];
  fow: { wicket: number; runs: number; out: string; label: string; legal: number; g: number }[];
  partnerships: Partnership[];
  overs: { over: number; runs: number; wickets: number; bowler: string; cum: number }[];
  complete: boolean; // the innings has ended at this cursor
  declared: boolean; // only once complete
  start: number;
}

export type Status = "live" | "replay" | "final";

export interface MatchState {
  cursor: number;
  ball: Delivery;
  status: Status;
  innings: InningsState[];
  current: InningsState;
  day: number | null;
  crease: string[]; // batters at the crease after this ball; a fallen wicket leaves one
  striker: string | null; // who faced this ball, if still in
  bowler: string;
  recent: Delivery[];
  lead: number; // current batting side's runs minus the opposition's, over all innings so far
  target: number | null; // runs needed to win in the 4th innings
}

export function stateAt(t: Timeline, cursor: number): MatchState {
  cursor = Math.max(0, Math.min(t.balls.length - 1, cursor));
  const ball = t.balls[cursor];
  const innings: InningsState[] = [];
  for (const meta of t.innings) {
    if (meta.start > cursor) break;
    innings.push(foldInnings(t.balls, meta.start, Math.min(meta.end, cursor), meta.n, meta.team));
    const s = innings[innings.length - 1];
    s.complete = cursor >= meta.end;
    s.declared = s.complete && meta.declared;
  }
  const current = innings[innings.length - 1];
  const out = new Set(ball.w?.filter((w) => !NOT_OUT_KINDS.has(w.k) || w.k === "retired hurt").map((w) => w.out));
  // An innings that ended all out or declared leaves nobody in; one cut off
  // by the end of the match leaves its not-out pair.
  const finished = current.complete && (current.wickets >= 10 || current.declared);
  const crease = finished ? [] : [ball.bat, ball.ns].filter((p) => !out.has(p));
  const day = t.days.length ? (t.days.find((d) => d.end >= cursor)?.day ?? null) : null;
  const final = t.bundle.match.complete && cursor === t.balls.length - 1;

  const runsFor = (team: string) => innings.filter((i) => i.team === team).reduce((a, i) => a + i.runs, 0);
  const other = t.bundle.match.teams.find((x) => x !== current.team) ?? "";
  let target: number | null = null;
  if (current.n === 4) target = runsFor(other) - (runsFor(current.team) - current.runs) + 1;

  return {
    cursor,
    ball,
    status: final ? "final" : "replay",
    innings,
    current,
    day,
    crease,
    striker: out.has(ball.bat) ? null : ball.bat,
    bowler: ball.bowl,
    recent: t.balls.slice(Math.max(current.start, cursor - 17), cursor + 1),
    lead: runsFor(current.team) - runsFor(other),
    target,
  };
}

function foldInnings(balls: Delivery[], start: number, end: number, n: number, team: string): InningsState {
  const s: InningsState = {
    n, team, runs: 0, wickets: 0, legal: 0,
    extras: { wd: 0, nb: 0, b: 0, lb: 0, pen: 0 },
    batters: [], bowlers: [], fow: [], partnerships: [], overs: [],
    complete: false, declared: false, start,
  };
  const bat = new Map<string, BatterInnings>();
  const bowl = new Map<string, BowlerInnings>();
  const batter = (id: string) => {
    let p = bat.get(id);
    if (!p) {
      p = { id, order: bat.size + 1, runs: 0, balls: 0, dots: 0, fours: 0, sixes: 0, out: null, retired: null };
      bat.set(id, p);
    }
    return p;
  };
  let stand: Partnership | null = null;
  let overRuns = 0;
  let curOver = -1;
  let overWkts = 0;
  let overBowler = "";
  const closeOver = () => {
    if (curOver < 0) return;
    s.overs.push({ over: curOver, runs: overRuns, wickets: overWkts, bowler: overBowler, cum: s.runs });
  };
  // Runs conceded and legal balls per over and bowler, for maidens.
  const spells = new Map<string, { bowler: string; runs: number; legal: number }>();

  for (let g = start; g <= end; g++) {
    const d = balls[g];
    if (d.o !== curOver) {
      closeOver();
      curOver = d.o;
      overRuns = 0;
      overWkts = 0;
      overBowler = d.bowl;
    }
    const striker = batter(d.bat);
    batter(d.ns);
    if (!stand) {
      stand = { wicket: s.wickets + 1, a: d.bat, b: d.ns, runs: 0, balls: 0, contrib: { [d.bat]: 0, [d.ns]: 0 }, start: g, end: g, broken: false };
      s.partnerships.push(stand);
    } else if (![stand.a, stand.b].includes(d.bat) || ![stand.a, stand.b].includes(d.ns)) {
      // A retirement brought a new pair together without a wicket.
      stand = { wicket: s.wickets + 1, a: d.bat, b: d.ns, runs: 0, balls: 0, contrib: { [d.bat]: 0, [d.ns]: 0 }, start: g, end: g, broken: false };
      s.partnerships.push(stand);
    }

    s.runs += d.total;
    overRuns += d.total;
    s.extras.wd += d.wd ?? 0;
    s.extras.nb += d.nb ?? 0;
    s.extras.b += d.b ?? 0;
    s.extras.lb += d.lb ?? 0;
    s.extras.pen += d.pen ?? 0;
    if (d.legal) s.legal++;
    striker.runs += d.rb;
    if (d.faced) {
      striker.balls++;
      if (d.rb === 0) striker.dots++;
    }
    if (!d.nbd && d.rb === 4) striker.fours++;
    if (!d.nbd && d.rb === 6) striker.sixes++;

    let w = bowl.get(d.bowl);
    if (!w) {
      w = { id: d.bowl, order: bowl.size + 1, balls: 0, runs: 0, wickets: 0, dots: 0, maidens: 0, wides: 0, noballs: 0 };
      bowl.set(d.bowl, w);
    }
    w.runs += d.conceded;
    w.wides += d.wd ?? 0;
    w.noballs += d.nb ? 1 : 0;
    if (d.legal) {
      w.balls++;
      if (d.conceded === 0) w.dots++;
    }
    const key = `${d.o}|${d.bowl}`;
    const so = spells.get(key) ?? { bowler: d.bowl, runs: 0, legal: 0 };
    so.runs += d.conceded;
    if (d.legal) so.legal++;
    spells.set(key, so);

    stand.runs += d.total;
    stand.contrib[d.bat] = (stand.contrib[d.bat] ?? 0) + d.rb;
    if (d.legal) stand.balls++;
    stand.end = g;

    for (const wk of d.w ?? []) {
      const p = batter(wk.out);
      if (NOT_OUT_KINDS.has(wk.k)) {
        p.retired = wk.k;
        if (stand) stand.broken = true;
        stand = null;
        continue;
      }
      s.wickets++;
      overWkts++;
      if (BOWLER_WICKETS.has(wk.k)) w.wickets++;
      p.out = { kind: wk.k, bowler: d.bowl, fielders: wk.f, at: g, label: d.label };
      s.fow.push({ wicket: s.wickets, runs: s.runs, out: wk.out, label: d.label, legal: s.legal, g });
      if (stand) {
        stand.broken = true;
        stand = null;
      }
    }
  }
  closeOver();
  // A maiden is six legal balls from one bowler conceding nothing; byes and
  // leg byes don't spoil it.
  for (const so of spells.values()) if (so.legal === 6 && so.runs === 0) bowl.get(so.bowler)!.maidens++;
  s.batters = [...bat.values()];
  s.bowlers = [...bowl.values()];
  return s;
}

export const oversText = (legal: number) => `${Math.floor(legal / 6)}${legal % 6 ? "." + (legal % 6) : ""}`;

export interface Moment {
  g: number;
  kind: "innings" | "day" | "wicket" | "milestone";
  text: string;
}

// Points worth jumping to: innings and day starts, wickets, batting
// milestones (50, 100, 150...) and five-wicket hauls. Names are ids; the UI
// formats them.
export function moments(t: Timeline, name: (id: string) => string): Moment[] {
  const out: Moment[] = [];
  for (const i of t.innings) out.push({ g: i.start, kind: "innings", text: `${i.team} innings ${t.innings.filter((x) => x.team === i.team && x.n <= i.n).length === 1 ? "1" : "2"} begins` });
  t.days.forEach((d, k) => k > 0 && out.push({ g: t.days[k - 1].end + 1, kind: "day", text: `Day ${d.day} begins` }));
  let runs: Record<string, number> = {};
  let wkts: Record<string, number> = {};
  let inn = 0;
  for (const b of t.balls) {
    if (b.inn !== inn) {
      inn = b.inn;
      runs = {};
      wkts = {};
    }
    const before = runs[b.bat] ?? 0;
    runs[b.bat] = before + b.rb;
    const mark = Math.floor(runs[b.bat] / 50) * 50;
    if (mark >= 50 && mark > before) out.push({ g: b.g, kind: "milestone", text: `${name(b.bat)} reaches ${mark}` });
    for (const w of b.w ?? []) {
      if (NOT_OUT_KINDS.has(w.k)) continue;
      out.push({ g: b.g, kind: "wicket", text: `${name(w.out)} out ${w.k}${BOWLER_WICKETS.has(w.k) ? `, ${name(b.bowl)}` : ""} (${runs[w.out] ?? 0})` });
      if (BOWLER_WICKETS.has(w.k)) {
        wkts[b.bowl] = (wkts[b.bowl] ?? 0) + 1;
        if (wkts[b.bowl] === 5) out.push({ g: b.g, kind: "milestone", text: `${name(b.bowl)} takes five` });
      }
    }
  }
  return out.sort((a, b) => a.g - b.g);
}
