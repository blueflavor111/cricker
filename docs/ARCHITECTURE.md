# Architecture

## Shape

```
Cricsheet JSON ──cricker-ingest──▶ DuckDB ──cricker-bundle──▶ match bundle JSON ──▶ web app
                                     ▲                          (events + history
                         annotations/*.json                     as of match start)
```

- **Python + DuckDB** does the heavy historical work once, offline. A bundle
  is about 500 KB raw (about 100 KB gzipped) and holds everything one match
  page needs, so the app is static files: no server, no database at request
  time, free to host.
- **The web app** (Vite, Preact, TypeScript; about 26 KB gzipped of code)
  replays the match in the browser. `web/src/engine` is pure functions with
  no UI imports; `web/src/ui` only renders.

## Decisions

**Deterministic replay.** `stateAt(timeline, cursor)` folds deliveries
0..cursor into the whole match state. Nothing is cached between cursor
positions, so a state can't carry anything from a later ball; a test tampers
with every later ball and checks the state is unchanged. Folding 2,600 balls
takes well under a millisecond, so precomputing states isn't worth it.

**History is cut at the match start in the bundle itself.** "Before this
match" can't leak, because later Tests aren't in the file. The app adds
this-match rows built from deliveries up to the cursor.

**One row shape for history and replay.** The SQL and the replay both emit
`[match, innings, balls, runs, ...]` rows, and every scope (career, series,
country, ground, last two years, match innings) is a filter over them. Adding
a filter is a predicate, not a new query.

**The contest is the last ball's batter and bowler.** Showing the next ball's
pairing would leak the future (bowling changes, the incoming batter).

**One page, three regions.** A sticky score header and timeline; a central
canvas (the contest, then how the innings is building, then scorecard,
matchups and ball log); a context column (ground totals, similar positions,
form, ground record). On phones the timeline moves to a bottom bar and the
regions become four views. State that matters (match, ball, window, open
profile) is in the URL hash, so a link reproduces the view.

## Extending

- **More matches**: run `cricker-bundle` for any Cricsheet match id; it
  updates `index.json` and the match switcher picks it up.
- **Other formats**: the tables already hold `match_type`; bundles filter on
  `match_type = 'Test'` and gender in one view (`PRIOR_VIEW`). ODIs and T20s
  need a format parameter there and format-aware labels (no follow-on, overs
  limits), not a new model.
- **Live data**: a provider adapter would append deliveries in the bundle's
  event shape (`RawBall`) and set `match.complete = false`; the replay engine
  and every view work unchanged, and the status becomes LIVE. It should stamp
  each update with the provider's time so the header can show staleness.
- **Market layer (not built)**: if added, it belongs in a separate module and
  bundle section (`markets: {provider, fetchedAt, region, prices}`), behind a
  feature flag that is off by default and off for Indian users. Prices must
  carry their provider and timestamp and never be blended into the observed
  statistics.
- **Player and ground pages**: the drawer and the context column already
  compute from bundle rows; a standalone page needs a bundle per player or
  ground built the same way.
