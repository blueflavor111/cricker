import type { Bundle, Delivery } from "../engine/types";
import type { BatterInnings } from "../engine/replay";

export const DASH = "–";
export const fx = (x: number | null | undefined, d = 1) => (x == null || !isFinite(x) ? DASH : x.toFixed(d));
export const fpct = (x: number | null | undefined) => (x == null ? DASH : `${Math.round(x)}%`);

const TEAM_CODES: Record<string, string> = {
  Australia: "AUS", India: "IND", England: "ENG", "New Zealand": "NZ", "South Africa": "SA", Pakistan: "PAK",
  "Sri Lanka": "SL", "West Indies": "WI", Bangladesh: "BAN", Zimbabwe: "ZIM", Afghanistan: "AFG", Ireland: "IRE",
};
export const code = (team: string) => TEAM_CODES[team] ?? team.slice(0, 3).toUpperCase();

// Team colours are identity only. Known teams get their own hue; anything
// else falls back to two neutral-safe slots by order in the match.
const TEAM_VAR: Record<string, string> = { Australia: "var(--aus)", India: "var(--ind)" };
export const teamColor = (b: Bundle, team: string) => TEAM_VAR[team] ?? (b.match.teams[0] === team ? "var(--team-a)" : "var(--team-b)");

export function names(b: Bundle) {
  const full = (id: string) => (id === "sub" ? "substitute" : (b.people[id]?.display ?? b.people[id]?.name ?? id));
  const short = (id: string) => {
    if (id === "sub") return "sub";
    const n = full(id).split(" ");
    return n[n.length - 1];
  };
  return { full, short };
}

export function dismissalText(b: Bundle, out: BatterInnings["out"]) {
  if (!out) return "not out";
  const { short } = names(b);
  const fs = out.fielders.map(short).join("/");
  const bw = short(out.bowler);
  switch (out.kind) {
    case "caught":
      return out.fielders[0] === out.bowler ? `c & b ${bw}` : `c ${fs} b ${bw}`;
    case "caught and bowled":
      return `c & b ${bw}`;
    case "bowled":
      return `b ${bw}`;
    case "lbw":
      return `lbw b ${bw}`;
    case "stumped":
      return `st ${fs} b ${bw}`;
    case "hit wicket":
      return `hit wkt b ${bw}`;
    case "run out":
      return fs ? `run out (${fs})` : "run out";
    default:
      return out.kind;
  }
}

// Short code for a delivery in the ball strip: "·", "4", "W", "1lb", "wd".
export function ballCode(d: Delivery): { text: string; kind: "dot" | "run" | "four" | "six" | "wicket" | "extra" } {
  if (d.w?.length) return { text: "W", kind: "wicket" };
  if (d.wd) return { text: d.total > 1 ? `${d.total}wd` : "wd", kind: "extra" };
  if (d.nb) return { text: d.rb ? `${d.rb}nb` : "nb", kind: "extra" };
  if (d.lb) return { text: `${d.lb}lb`, kind: "extra" };
  if (d.b) return { text: `${d.b}b`, kind: "extra" };
  if (d.rb === 4 && !d.nbd) return { text: "4", kind: "four" };
  if (d.rb === 6 && !d.nbd) return { text: "6", kind: "six" };
  if (d.rb === 0) return { text: "·", kind: "dot" };
  return { text: String(d.rb), kind: "run" };
}

export function describeBall(b: Bundle, d: Delivery) {
  const { short } = names(b);
  const parts = [`${short(d.bowl)} to ${short(d.bat)}`];
  const c = ballCode(d);
  if (d.w?.length) parts.push(`OUT, ${d.w.map((w) => `${short(w.out)} ${w.k}`).join(", ")}`);
  else if (c.kind === "four") parts.push("FOUR");
  else if (c.kind === "six") parts.push("SIX");
  else if (d.wd) parts.push(`${d.total} wide${d.total > 1 ? "s" : ""}`);
  else if (d.nb) parts.push(`no-ball${d.rb ? `, ${d.rb} off the bat` : ""}`);
  else if (d.lb) parts.push(`${d.lb} leg bye${d.lb > 1 ? "s" : ""}`);
  else if (d.b) parts.push(`${d.b} bye${d.b > 1 ? "s" : ""}`);
  else parts.push(d.rb === 0 ? "no run" : `${d.rb} run${d.rb > 1 ? "s" : ""}`);
  return parts.join(", ");
}

export const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
