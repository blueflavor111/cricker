import { useMatch } from "./context";
import { useWidth } from "./useWidth";
import { code, fx, names, ordinal, teamColor } from "./format";
import { comparable, groundRecord, quantile, totals, type Total } from "../engine/context";
import { average, economy } from "../engine/definitions";
import { batAgg, bowlAgg, fmtDate, shortVenue } from "../engine/stats";
import { Name } from "./Name";

// Supporting column. Conditional history (innings that were where this one
// is now) comes first; unconditional ground history is labelled as such.
export function GroundContext() {
  const { bundle } = useMatch();
  const v = shortVenue(bundle.match.venue.name).replace(/^the /, "The ");
  return (
    <section class="context" aria-labelledby="context-h">
      <header class="sec-head">
        <h2 id="context-h">Match context</h2>
      </header>
      <Comparable />
      <div class="ctx-block">
        <h3 class="ctx-h">Ground history: {v}</h3>
        <p class="ctx-sub">Every innings here in the data, whatever the match state.</p>
        <TotalStrip />
        <Record />
      </div>
      <Form />
    </section>
  );
}

// A dot per innings on a runs axis, stacked where they would overlap, with
// the middle half shaded and the median marked.
function DotStrip({ values, now, label, nowLabel }: { values: Total[]; now: number | null; label: string; nowLabel?: string }) {
  const { bundle, state } = useMatch();
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const sorted = values.map((t) => t.runs).sort((a, b) => a - b);
  const p25 = quantile(sorted, 0.25)!;
  const p50 = quantile(sorted, 0.5)!;
  const p75 = quantile(sorted, 0.75)!;
  const max = Math.max(500, Math.ceil(Math.max(...sorted, now ?? 0) / 100) * 100);
  const W = Math.max(240, width);
  const m = { l: 10, r: 10 };
  const x = (r: number) => m.l + ((W - m.l - m.r) * r) / max;
  const lanes: number[][] = [];
  const placed = [...values]
    .sort((a, b) => a.runs - b.runs)
    .map((t) => {
      let lane = 0;
      while ((lanes[lane] ?? []).some((px) => Math.abs(px - x(t.runs)) < 8)) lane++;
      (lanes[lane] ??= []).push(x(t.runs));
      return { t, lane };
    });
  const depth = Math.min(6, lanes.length);
  const base = 22 + depth * 8;
  const H = base + 26;
  const step = max > 600 ? 200 : 100;
  return (
    <div ref={ref} class="dotstrip">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
        <rect class="ds-iqr" x={x(p25)} y={12} width={x(p75) - x(p25)} height={base - 8} />
        <line class="ds-axis" x1={m.l} x2={W - m.r} y1={base + 4} y2={base + 4} />
        {Array.from({ length: max / step + 1 }, (_, k) => k * step).map((t) => (
          <text class="ds-tick" x={x(t)} y={base + 20} text-anchor={t === 0 ? "start" : t === max ? "end" : "middle"}>
            {t}
          </text>
        ))}
        {placed.map(({ t, lane }) => (
          <circle class={`ds-dot ${t.allOut ? "" : "is-open"}`} cx={x(t.runs)} cy={base - 3 - Math.min(lane, depth - 1) * 8} r={3.3}>
            <title>
              {t.team} {t.runs}
              {t.allOut ? "" : `/${t.wickets}`}
              {t.declared ? "d" : ""}, {fmtDate(t.date)}
            </title>
          </circle>
        ))}
        <line class="ds-med" x1={x(p50)} x2={x(p50)} y1={8} y2={base + 4} />
        {now != null && (
          <g class="ds-now" style={{ "--team": teamColor(bundle, state.current.team) }}>
            <line x1={x(now)} x2={x(now)} y1={2} y2={base + 4} />
            <text x={x(now)} y={8} dx={x(now) > W - 70 ? -4 : 4} text-anchor={x(now) > W - 70 ? "end" : "start"}>
              {nowLabel ?? now}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function Comparable() {
  const { bundle, state } = useMatch();
  const cur = state.current;
  const overs = Math.floor(cur.legal / 6);
  const where = bundle.match.venue.country ?? "this country";
  const head = <h3 class="ctx-h">What have teams done from similar positions?</h3>;
  if (cur.complete)
    return (
      <div class="ctx-block ctx-lead">
        {head}
        <p class="ctx-sub">The {ordinal(cur.n)} innings is over, so there is no position to compare. Move the timeline back into an innings to see it.</p>
      </div>
    );
  if (overs < 5)
    return (
      <div class="ctx-block ctx-lead">
        {head}
        <p class="ctx-sub">Shown from the 5th over of an innings, when positions start to differ.</p>
      </div>
    );
  const at = cur.overs.find((o) => o.over === overs - 1)?.cum ?? cur.runs;
  const wk = cur.fow.filter((f) => f.legal <= overs * 6).length;
  const c = comparable(bundle, bundle.history.country, cur.n, overs, at, wk);
  return (
    <div class="ctx-block ctx-lead">
      {head}
      <p class="ctx-sub">
        {ordinal(cur.n)} innings in {where} that were within 25 runs of <b class="num">{at}/{wk}</b> (±1 wicket) after {overs} overs. Where they finished:
      </p>
      {c.n < 5 ? (
        <p class="empty">
          Only {c.n} such innings in the data, too few to summarise.
        </p>
      ) : (
        <>
          <dl class="cmp-figs">
            <div class="cmp-main">
              <dt>Median final total</dt>
              <dd class="num">{Math.round(c.median!)}</dd>
            </div>
            <div>
              <dt>Middle half</dt>
              <dd class="num">
                {Math.round(c.p25!)}–{Math.round(c.p75!)}
              </dd>
            </div>
            <div>
              <dt>Innings</dt>
              <dd class="num">{c.n}</dd>
            </div>
          </dl>
          <DotStrip values={c.finals} now={cur.runs} nowLabel={`now ${cur.runs}`} label={`Final totals of ${c.n} similar innings: median ${Math.round(c.median!)}, middle half ${Math.round(c.p25!)} to ${Math.round(c.p75!)}.`} />
          <p class="fig-note">
            <i class="k-iqr" /> middle half <i class="k-med" /> median · filled dot all out, open dot declared or unfinished
            {c.declared ? ` (${c.declared} declared)` : ""}. History, not a forecast.
          </p>
        </>
      )}
    </div>
  );
}

function TotalStrip() {
  const { bundle, state } = useMatch();
  const cur = state.current;
  const all = totals(bundle, bundle.history.venue, cur.n);
  const v = shortVenue(bundle.match.venue.name);
  if (!all.length) return <p class="empty">No {ordinal(cur.n)} innings at {v} in the data.</p>;
  const sorted = all.map((t) => t.runs).sort((a, b) => a - b);
  const med = quantile(sorted, 0.5)!;
  const passed = sorted.filter((r) => r >= cur.runs).length;
  return (
    <figure class="ctx-fig">
      <figcaption>
        <b>{ordinal(cur.n)} innings totals</b>{" "}
        <span class="muted num">
          {all.length} innings, {all[0].date.slice(0, 4)}–{all[all.length - 1].date.slice(0, 4)} · median {Math.round(med)}
        </span>
      </figcaption>
      <DotStrip values={all} now={cur.runs} nowLabel={`${cur.complete ? "" : "now "}${cur.runs}`} label={`Past ${ordinal(cur.n)} innings totals at ${v}: median ${Math.round(med)}. ${passed} of ${all.length} reached ${cur.runs}.`} />
      <p class="fig-note num">
        {passed} of {all.length} reached {cur.runs}
        {cur.complete ? "" : " or more"}.
      </p>
    </figure>
  );
}

function Record() {
  const { bundle } = useMatch();
  const r = groundRecord(bundle);
  if (!r.tests) return null;
  const facts: [string, string, string?][] = [
    ["Tests in the data", `${r.tests}`, `${r.from!.slice(0, 4)}–${r.to!.slice(0, 4)}`],
    ["Drawn", `${r.draws}`],
    ["Won by side batting first", `${r.batFirstWon}`, `lost ${r.batFirstLost}`],
    ["Toss winner chose to bat", `${r.tossBat}`],
    ["4th-innings chases won", `${r.chasesWon}`, `of ${r.chasesTried}`],
    ["Highest chase", r.highestChase ? `${r.highestChase.runs}` : "none", r.highestChase ? `${code(r.highestChase.team)} ${r.highestChase.date.slice(0, 4)}` : ""],
  ];
  return (
    <table class="table facts">
      <tbody>
        {facts.map(([k, v, s]) => (
          <tr>
            <th scope="row">{k}</th>
            <td>{v}</td>
            <td class="muted">{s ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Form() {
  const { bundle, state, rows, scopes } = useMatch();
  const cur = state.current;
  if (!state.crease.length) return null;
  const n = names(bundle);
  const before = scopes.find((s) => s.id === "before")!;
  const venue = scopes.find((s) => s.id === "venue")!;
  const v = shortVenue(bundle.match.venue.name);
  const w = cur.bowlers.find((x) => x.id === state.bowler)!;
  const wc = bowlAgg(bundle, rows, w.id, before);
  const wv = bowlAgg(bundle, rows, w.id, { ...venue, current: false });
  const cell = (runs: number, outs: number, inns: number) =>
    inns === 0 ? <td class="none">–</td> : <td title={`${inns} innings, ${outs} dismissals`}>{fx(average(runs, outs))}<small> {inns}i</small></td>;
  return (
    <div class="ctx-block">
      <h3 class="ctx-h">Today against their record</h3>
      <p class="ctx-sub">Averages before this match; small figures are innings or Tests.</p>
      <table class="table compact">
        <thead>
          <tr>
            <th scope="col">Batter</th>
            <th scope="col">Today</th>
            <th scope="col">Career</th>
            <th scope="col">Here</th>
          </tr>
        </thead>
        <tbody>
          {state.crease.map((id) => {
            const b = cur.batters.find((x) => x.id === id)!;
            const c = batAgg(bundle, rows, id, before);
            const atV = batAgg(bundle, rows, id, { ...venue, current: false });
            return (
              <tr>
                <th scope="row">
                  <Name id={id} short />
                </th>
                <td>
                  {b.runs}* <small>({b.balls})</small>
                </td>
                {cell(c.runs, c.outs, c.innings)}
                {cell(atV.runs, atV.outs, atV.innings)}
              </tr>
            );
          })}
        </tbody>
        <thead>
          <tr>
            <th scope="col">Bowler</th>
            <th scope="col">Today</th>
            <th scope="col">Career</th>
            <th scope="col">Here</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">
              <Name id={w.id} short />
            </th>
            <td>
              {w.wickets}–{w.runs}
            </td>
            <td title={`${wc.wickets} wickets in ${wc.matches} Tests, economy ${fx(economy(wc.runs, wc.balls), 2)}`}>
              {fx(wc.wickets ? wc.runs / wc.wickets : null)}
              <small> {wc.matches}T</small>
            </td>
            <td title={`${wv.wickets} wickets in ${wv.matches} Tests at ${v}`}>
              {wv.matches ? (
                <>
                  {fx(wv.wickets ? wv.runs / wv.wickets : null)}
                  <small> {wv.matches}T</small>
                </>
              ) : (
                <span class="muted">first Test</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="fig-note">{n.short(w.id)}'s bowling average counts only wickets credited to the bowler.</p>
    </div>
  );
}
