// Data contract for a match bundle, written by cricker/bundle.py.
// Bump SCHEMA there and here together.
export const SCHEMA = 1;

export interface Wicket {
  k: string; // Cricsheet dismissal kind
  out: string; // person id
  f: string[]; // fielders, 'sub' for substitutes
}

// One delivery as Cricsheet records it. Zero-valued fields are omitted.
export interface RawBall {
  o: number; // over number, from 0
  bat: string;
  bowl: string;
  ns: string;
  rb: number; // runs off the bat
  wd?: number;
  nb?: number;
  b?: number;
  lb?: number;
  pen?: number;
  nbd?: 1; // a 4 or 6 that was run, not a boundary
  w?: Wicket[];
}

export interface RawInnings {
  team: string;
  declared: boolean;
  forfeited: boolean;
  balls: RawBall[];
}

export interface CloseOfPlay {
  day: number;
  innings: number;
  overs: string;
  score: string;
  source: string;
}

export interface HistoryMatch {
  date: string;
  venue: string;
  venueName: string;
  city: string | null;
  country: string | null;
  series: string | null;
  teams: [string, string];
  winner: string | null;
  result: string | null;
  toss: [string | null, string | null];
  inns: string[]; // batting team by innings
}

// Row layouts; positions match HISTORY_COLUMNS in bundle.py.
// h2h:     [match, innings, balls, runs, outs, dots, ones, twos, threes, fours, sixes]
// batting: [match, innings, balls, runs, outs, bowlerOuts, dots, ones, twos, threes, fours, sixes]
// bowling: [match, innings, balls, runs, wickets, dots]
// team:    [match, innings, team, runs, wickets, balls, declared, cum[], wkts[]]
export type H2HRow = [string, number, number, number, number, number, number, number, number, number, number];
export type BatRow = [string, number, number, number, number, number, number, number, number, number, number, number];
export type BowlRow = [string, number, number, number, number, number];
export type TeamInningsRow = [string, number, string, number, number, number, boolean, number[], number[]];

export interface History {
  before: string; // ISO date: every row comes from a Test that started earlier
  matches: Record<string, HistoryMatch>;
  h2h: Record<string, H2HRow[]>; // key "batter|bowler"
  batting: Record<string, BatRow[]>;
  bowling: Record<string, BowlRow[]>;
  dismissedBy: Record<string, [string, number][]>;
  dismissed: Record<string, [string, number][]>;
  venue: TeamInningsRow[];
  country: TeamInningsRow[];
}

export interface Bundle {
  schema: number;
  generated: string;
  source: { provider: string; url: string; dataVersion: string; revision: number; created: string; licence: string };
  match: {
    id: string;
    format: string;
    gender: string;
    series: { key: string | null; name: string | null; season: string | null; number: number | null };
    dates: string[];
    venue: { id: string; name: string; city: string | null; country: string | null; raw: string };
    teams: [string, string];
    toss: { winner: string | null; decision: string | null };
    outcome: { winner?: string; result?: string; by: { runs?: number; wickets?: number; innings?: number }; method?: string };
    playerOfMatch: string[];
    complete: boolean;
  };
  squads: Record<string, string[]>;
  people: Record<string, { name: string; display: string }>;
  innings: RawInnings[];
  annotations: { closeOfPlay?: CloseOfPlay[] };
  history: History;
}

// A delivery placed in the match timeline.
export interface Delivery extends RawBall {
  g: number; // index in the whole match
  inn: number; // match innings, from 1
  i: number; // index within the innings
  legal: boolean; // counts towards the over (not a wide or no-ball)
  faced: boolean; // counts as a ball faced by the batter (not a wide)
  legalNo: number; // legal balls in the innings up to and including this one
  label: string; // "86.4": completed overs . legal balls in the current over
  total: number; // all runs on the ball
  conceded: number; // runs charged to the bowler
}
