// Statistical definitions. Each one is stated once here and used everywhere;
// cricker/bundle.py computes the historical rows with the same rules (see
// docs/DATA.md), and tests/crosscheck.test.ts holds the two to agreement.

// Dismissals credited to the bowler.
export const BOWLER_WICKETS = new Set(["bowled", "caught", "caught and bowled", "lbw", "stumped", "hit wicket"]);
// Ways of leaving the crease that don't count as an innings-ending dismissal.
export const NOT_OUT_KINDS = new Set(["retired hurt", "retired not out"]);

export interface BatAgg {
  innings: number;
  balls: number; // balls faced: everything except wides
  runs: number; // runs off the bat only
  outs: number; // dismissals that count against the batter's average
  dots: number; // balls faced with no runs off the bat
  ones: number;
  twos: number;
  threes: number;
  fours: number; // hit to the boundary; run fours are excluded
  sixes: number;
  matches: number;
}

export const emptyBat = (): BatAgg => ({
  innings: 0, balls: 0, runs: 0, outs: 0, dots: 0, ones: 0, twos: 0, threes: 0, fours: 0, sixes: 0, matches: 0,
});

export interface BowlAgg {
  innings: number;
  balls: number; // legal deliveries
  runs: number; // off the bat plus wides and no-balls; byes and leg byes aren't the bowler's
  wickets: number; // bowler-credited dismissals
  dots: number; // legal balls conceding nothing
  matches: number;
}

export const emptyBowl = (): BowlAgg => ({ innings: 0, balls: 0, runs: 0, wickets: 0, dots: 0, matches: 0 });

// Derived figures return null when undefined rather than 0: an average with
// no dismissals doesn't exist, and a strike rate off no balls isn't zero.
export const average = (runs: number, outs: number) => (outs > 0 ? runs / outs : null);
export const strikeRate = (runs: number, balls: number) => (balls > 0 ? (100 * runs) / balls : null);
export const pct = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);
export const economy = (runs: number, balls: number) => (balls > 0 ? (6 * runs) / balls : null);
export const ballsPer = (balls: number, n: number) => (n > 0 ? balls / n : null);

// --- Uncertainty -----------------------------------------------------------
//
// A head-to-head average rests on a handful of dismissals. We treat
// dismissals as arriving at a steady rate per ball faced (a Poisson process)
// and take the exact 90% interval for that rate. Dividing the observed strike
// rate by the bounds gives a plausible range for the average. It's a model,
// labelled as such in the UI, and it ignores the noise in the strike rate,
// which is small next to the noise in the dismissal count.

// Regularized lower incomplete gamma P(a, x).
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const lnGammaA = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGammaA);
  }
  // Continued fraction for the upper tail (Lentz).
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGammaA) * h;
}

function lnGamma(z: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// Quantile of the gamma(a, 1) distribution, by bisection.
function gammaQuantile(p: number, a: number): number {
  let lo = 0;
  let hi = Math.max(10, a * 10);
  while (gammaP(a, hi) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (gammaP(a, mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Exact two-sided interval for a Poisson count k (Garwood).
export function poissonInterval(k: number, level = 0.9): [number, number] {
  const alpha = 1 - level;
  const lower = k === 0 ? 0 : gammaQuantile(alpha / 2, k);
  const upper = gammaQuantile(1 - alpha / 2, k + 1);
  return [lower, upper];
}

export interface AverageRange {
  low: number; // average if dismissals came at the upper plausible rate
  high: number | null; // null when there's no upper bound worth showing
}

// Plausible range for a batting average given runs, balls and dismissals.
export function averageRange(runs: number, balls: number, outs: number, level = 0.9): AverageRange | null {
  if (balls === 0) return null;
  const [lo, hi] = poissonInterval(outs, level);
  return { low: runs / hi, high: lo > 0 ? runs / lo : null };
}

export type Evidence = "none" | "very-thin" | "thin" | "moderate" | "solid";

// How much the dismissal count can support. Balls matter too: 0 outs in 15
// balls says nothing, 0 outs in 200 balls says something.
export function evidence(balls: number, outs: number): Evidence {
  if (balls === 0) return "none";
  if (outs >= 20) return "solid";
  if (outs >= 10) return "moderate";
  if (outs >= 5 || balls >= 240) return "thin";
  return "very-thin";
}

export const EVIDENCE_TEXT: Record<Evidence, string> = {
  none: "No balls",
  "very-thin": "Very little evidence",
  thin: "Thin evidence",
  moderate: "Moderate evidence",
  solid: "Solid evidence",
};

export type Edge = "insufficient" | "batter" | "bowler" | "even";

// Compare a head-to-head with the batter's usual average against all bowlers
// in the same window. Only says someone has the edge when the whole plausible
// range sits on one side of the baseline.
export function edge(range: AverageRange | null, baseline: number | null, balls: number, outs: number): Edge {
  if (!range || baseline == null || (outs < 3 && balls < 120)) return "insufficient";
  if (range.high != null && range.high < baseline) return "bowler";
  if (range.low > baseline) return "batter";
  return "even";
}
