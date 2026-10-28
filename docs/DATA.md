# Data: layers, sources and definitions

Every number in Cricker can be traced through four layers. Each layer only
reads from the one before it.

| Layer | Where | What it holds |
| --- | --- | --- |
| Raw provider data | `data/raw/tests/*.json` (not committed) | Cricsheet match files exactly as downloaded |
| Normalized events | DuckDB tables from `cricker-ingest` | matches, people, match_players, innings, deliveries, dismissals |
| Derived aggregates | match bundles from `cricker-bundle`, `web/public/data/*.json` | the match as ball events, plus per-innings history rows as known before the match |
| Presentation | `web/src/ui` | renders what `web/src/engine` computes; computes nothing of its own |

Model-derived interpretation (currently only the head-to-head "plausible
range") lives in `web/src/engine/definitions.ts` and is labelled
*Interpretation* wherever it appears.

## Sources

**Cricsheet** (https://cricsheet.org) is the only source in use.

- Coverage: ball-by-ball for 897 men's Tests from Dec 2001 to Oct 2026 in the
  current download. Earlier Tests, and some Tests after 2001, are missing,
  so ground and career figures are counts *of the data*, and the UI says so.
- Latency: matches appear days after they finish. Not a live source.
- Content: deliveries, extras, dismissals with fielders, teams, toss, result,
  players, DRS reviews. No line, length, field placings, ball speed, session
  or day boundaries.
- Licence: Open Data Commons Attribution License (ODC-By) 1.0. Attribution is
  in the app footer.
- Cost: free.

**Close of play** (`annotations/<match>.json`) is curated by hand for matches
where we want day navigation, each entry with a source URL. The replay engine
only accepts a marker whose overs, runs and wickets match the ball data, so a
wrong entry is dropped rather than shown. Lunch and tea aren't recorded, so
there are no sessions.

Candidate live sources were costed in the concept doc (CricketData.org from
about $6 a month, Sportmonks from about €29 a month). None is connected yet.
Betting odds are not displayed; see ARCHITECTURE.md for how a market layer
would plug in.

## Identity

- **Players** are keyed by Cricsheet's registry id, never by name. Display
  names come from Cricsheet's `names.csv` register: Cricsheet's own name if it
  is already a full name ("Mohammed Siraj"), otherwise the shortest register
  variant that keeps the same surname and first initial ("PJ Cummins" becomes
  "Pat Cummins", not the register's stray "Anderson Cummins").
- **Grounds** get one id across spellings and renames (`cricker/venues.py`):
  "Brisbane Cricket Ground, Woolloongabba, Brisbane" and "Brisbane Cricket
  Ground" are both `brisbane-cricket-ground`; Feroz Shah Kotla is Arun Jaitley
  Stadium. Cricsheet has no country, so host country comes from the same
  table; an unknown ground gets no country rather than a guess.
- **Series** are Cricsheet's event name plus season, e.g. "India tour of
  Australia 2024/25".

## Definitions

These are implemented twice, in SQL (`cricker/bundle.py`) for history and in
TypeScript (`web/src/engine`) for the match being replayed.
`web/tests/crosscheck.test.ts` replays the Gabba Test and checks every batting,
bowling and head-to-head row against the SQL rows for the same match.

| Term | Definition |
| --- | --- |
| Ball faced | Any delivery except a wide. No-balls count. |
| Legal ball | Not a wide and not a no-ball. Overs and bowler balls count these. |
| Batter runs | Runs off the bat only. Byes, leg byes, wides and no-ball extras are not the batter's. |
| Runs conceded | Runs off the bat plus wides plus no-balls. Byes, leg byes and penalties aren't the bowler's. |
| Dot ball (batter) | A ball faced with no runs off the bat, including a dismissal ball and a leg bye. |
| Dot ball (bowler) | A legal ball conceding nothing. |
| Four, six | `runs_batter` of 4 or 6 that wasn't run (Cricsheet's `non_boundary`). |
| Bowler-credited dismissal | bowled, caught, caught and bowled, lbw, stumped, hit wicket. |
| Out (batting average) | Any dismissal except retired hurt and retired not out. |
| Head-to-head dismissal | A bowler-credited dismissal of the striker by that bowler. Run outs don't count against a bowler. |
| Average | Runs / dismissals. With no dismissals there is no average: the UI shows "not out" or "n/o", never 0 or infinity. |
| Strike rate | 100 × runs / balls faced. Null with no balls. |
| Innings (batting) | The batter faced a ball, stood at the non-striker's end, or was dismissed. |
| Partnership | Runs (including extras) and legal balls between wickets, or between a wicket and a retirement. |
| Maiden | A complete over of six legal balls from one bowler conceding no runs. |
| Before this match | Tests that started before this match's first day. Nothing from this match is in a bundle's history. |
| This match so far | Deliveries up to and including the selected one. |
| Career | Before this match plus this match so far. |
| Last 2 years | Tests starting within two years before this match, plus this match so far. |

## Uncertainty

A head-to-head average often rests on a handful of dismissals. Cricker shows:

- **Evidence**: five pips for 1, 2, 5, 10 and 20+ dismissals, with the count
  stated in words.
- **Plausible range** (labelled *Interpretation*): an exact 90% Poisson
  interval for the number of dismissals given the balls faced, turned into a
  range for the average (runs / upper bound to runs / lower bound). With no
  dismissals the range has no upper limit.
- **Verdict**: someone "has had the better of it" only when the whole range
  sits on one side of the batter's usual average (runs per bowler-credited
  dismissal against all bowlers in the same window). Below 3 dismissals and
  120 balls the verdict is "too little evidence".

Ground context is descriptive: the distribution of past totals for the same
innings number, a band of past progressions that stops when fewer than six
innings were still going, and "from a similar position", past innings in the
same country within 25 runs and one wicket at the same over, with their
finishing totals. None of it is a forecast.
