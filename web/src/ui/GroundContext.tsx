import { useMatch } from "./context";
import { useWidth } from "./useWidth";
import { code, fx, names, ordinal, teamColor } from "./format";
import { comparable, groundRecord, quantile, totals } from "../engine/context";
import { average, economy } from "../engine/definitions";
import { batAgg, bowlAgg, fmtDate, shortVenue } from "../engine/stats";
import { Info } from "./Info";
import { Name } from "./Name";

export function GroundContext() {
  const { bundle } = useMatch();
  const v = shortVenue(bundle.match.venue.name);
  return (
    <section class="panel ground" aria-labelledby="ground-h">
      <h2 id="ground-h" class="kicker">
        Context <span class="kicker-sub">{v.replace(/^the /, "The ")}{bundle.match.venue.country ? `, ${bundle.match.venue.country}` : ""}</span>
      </h2>
      <TotalStrip />
      <Comparable />
      <Form />
      <Record />
    </section>
  );
}

function TotalStrip() {
  const { bundle, state } = useMatch();
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const cur = state.current;
  const all = totals(bundle, bundle.history.venue, cur.n);
  const v = shortVenue(bundle.match.venue.name);
  if (!all.length) return <p class="empty">No {ordinal(cur.n)} innings at {v} in the data.</p>;
  const sorted = all.map((t) => t.runs).sort((a, b) => a - b);
  const med = quantile(sorted, 0.5)!;
  const max = Math.max(500, Math.ceil(Math.max(...sorted, cur.runs) / 100) * 100);
  const H = 90;
  const m = { l: 8, r: 8 };
  const x = (r: number) => m.l + ((width - m.l - m.r) * r) / max;
  const passed = sorted.filter((r) => r >= cur.runs).length;
  // Stack dots that would overlap, so every innings stays visible.
  const lanes: number[][] = [];
  const placed = [...all].sort((a, b) => a.runs - b.runs).map((t) => {
    let lane = 0;
    while ((lanes[lane] ?? []).some((px) => Math.abs(px - x(t.runs)) < 9)) lane++;
    (lanes[lane] ??= []).push(x(t.runs));
    return { t, lane };
  });

  return (
    <figure class="strip">
      <figcaption>
        <b>
          {ordinal(cur.n)} innings totals at {v}
        </b>{" "}
        <span class="muted">
          {all.length} innings, {fmtDate(all[0].date).slice(-4)}–{fmtDate(all[all.length - 1].date).slice(-4)}
        </span>
      </figcaption>
      <div ref={ref}>
        <svg width={width} height={H} role="img" aria-label={`Past ${ordinal(cur.n)} innings totals at ${v}: median ${Math.round(med)}. ${passed} of ${all.length} reached ${cur.runs}.`}>
          <line class="grid" x1={m.l} x2={width - m.r} y1={56} y2={56} />
          {[0, 100, 200, 300, 400, 500, 600, 700, 800].filter((t) => t <= max).map((t) => (
            <text class="axis" x={x(t)} y={82} text-anchor="middle">
              {t}
            </text>
          ))}
          {placed.map(({ t, lane }) => (
            <circle class={`tot ${t.allOut ? "all-out" : "not-all-out"}`} cx={x(t.runs)} cy={56 - 8 - lane * 9} r={4}>
              <title>
                {t.team} {t.runs}/{t.wickets}
                {t.declared ? "d" : ""}, {t.date}
              </title>
            </circle>
          ))}
          <line class="median" x1={x(med)} x2={x(med)} y1={18} y2={62} />
          <g style={{ "--team": teamColor(bundle, cur.team) }}>
            <line class="now-line" x1={x(cur.runs)} x2={x(cur.runs)} y1={16} y2={62} />
            <text class="now-label" x={x(cur.runs)} y={11} text-anchor={x(cur.runs) > width - 60 ? "end" : x(cur.runs) < 40 ? "start" : "middle"}>
              {cur.complete ? "" : "now "}
              {cur.runs}
            </text>
          </g>
        </svg>
      </div>
      <p class="strip-note">
        Median <b class="num">{Math.round(med)}</b>. {passed} of {all.length} reached {cur.runs}
        {cur.complete ? "" : " or more"}. <span class="key-filled" /> all out <span class="key-hollow" /> declared or not out.
      </p>
    </figure>
  );
}

function Comparable() {
  const { bundle, state } = useMatch();
  const cur = state.current;
  const overs = Math.floor(cur.legal / 6);
  if (cur.complete || overs < 5) return null;
  const at = cur.overs.find((o) => o.over === overs - 1)?.cum ?? cur.runs;
  const wk = cur.fow.filter((f) => f.legal <= overs * 6).length;
  const c = comparable(bundle, bundle.history.country, cur.n, overs, at, wk);
  const where = bundle.match.venue.country ?? "this country";
  return (
    <div class="comparable">
      <h3 class="mini-h">
        From a similar position
        <Info text={`Past ${ordinal(cur.n)} innings in ${where} that, after ${overs} overs, were within 25 runs of ${at} and within one wicket of ${wk} down. What they finished on is history, not a forecast: pitches, declarations and the weather all differ.`} />
      </h3>
      {c.n < 5 ? (
        <p class="muted">
          Only {c.n} past {ordinal(cur.n)} innings in {where} were near {at}/{wk} after {overs} overs. Too few to summarise.
        </p>
      ) : (
        <p>
          <b class="num">{c.n}</b> {ordinal(cur.n)} innings in {where} were near <b class="num">{at}/{wk}</b> after {overs} overs. They finished on a median of{" "}
          <b class="num">{Math.round(c.median!)}</b>, the middle half between {Math.round(c.p25!)} and {Math.round(c.p75!)}
          {c.declared ? `; ${c.declared} of them declared` : ""}.
        </p>
      )}
    </div>
  );
}

function Form() {
  const { bundle, state, rows, scopes } = useMatch();
  const cur = state.current;
  if (!state.crease.length) return null;
  const n = names(bundle);
  const career = scopes.find((s) => s.id === "before")!;
  const country = scopes.find((s) => s.id === "country");
  const venue = scopes.find((s) => s.id === "venue")!;
  const batRows = state.crease.map((id) => {
    const b = cur.batters.find((x) => x.id === id)!;
    const c = batAgg(bundle, rows, id, career);
    const inC = country ? batAgg(bundle, rows, id, { ...country, current: false }) : null;
    const atV = batAgg(bundle, rows, id, { ...venue, current: false });
    return { id, b, c, inC, atV };
  });
  const w = cur.bowlers.find((x) => x.id === state.bowler)!;
  const wc = bowlAgg(bundle, rows, w.id, career);
  const wv = bowlAgg(bundle, rows, w.id, { ...venue, current: false });
  const avgCell = (runs: number, outs: number, inns: number) =>
    inns === 0 ? <td class="none">–</td> : <td title={`${inns} innings, ${outs} dismissals`}>{fx(average(runs, outs))}<small> {inns}i</small></td>;
  return (
    <div class="form">
      <h3 class="mini-h">
        Today against their record
        <Info text="Before this match: Tests that started earlier. Averages count every dismissal, as published; the small figure is innings played." />
      </h3>
      <table class="table num compact">
        <thead>
          <tr>
            <th>Batting</th>
            <th>Now</th>
            <th>Career avg</th>
            {country && <th>In {code(country.label.replace(/^In /, ""))}</th>}
            <th>Here</th>
          </tr>
        </thead>
        <tbody>
          {batRows.map(({ id, b, c, inC, atV }) => (
            <tr>
              <th scope="row">
                <Name id={id} short />
              </th>
              <td>
                {b.runs}* <small>({b.balls})</small>
              </td>
              {avgCell(c.runs, c.outs, c.innings)}
              {inC && avgCell(inC.runs, inC.outs, inC.innings)}
              {avgCell(atV.runs, atV.outs, atV.innings)}
            </tr>
          ))}
        </tbody>
      </table>
      <table class="table num compact">
        <thead>
          <tr>
            <th>Bowling</th>
            <th>Now</th>
            <th>Career avg</th>
            <th>Econ</th>
            <th>Here</th>
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
            <td title={`${wc.wickets} wickets in ${wc.matches} Tests`}>{fx(wc.wickets ? wc.runs / wc.wickets : null)}</td>
            <td>{fx(economy(wc.runs, wc.balls), 2)}</td>
            <td title={`${wv.wickets} wickets in ${wv.matches} Tests here`}>{wv.matches ? `${fx(wv.wickets ? wv.runs / wv.wickets : null)} ` : "first Test"}{wv.matches ? <small>{wv.matches}T</small> : null}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted small">{n.short(w.id)}'s figures here are from earlier Tests only.</p>
    </div>
  );
}

function Record() {
  const { bundle } = useMatch();
  const r = groundRecord(bundle);
  if (!r.tests) return null;
  const facts: [string, string, string?][] = [
    ["Tests in the data", `${r.tests}`, `${fmtDate(r.from!)} to ${fmtDate(r.to!)}`],
    ["Drawn", `${r.draws}`, `of ${r.tests}`],
    ["Side batting first won", `${r.batFirstWon}`, `lost ${r.batFirstLost}`],
    ["Toss winner chose to bat", `${r.tossBat}`, `of ${r.tests}`],
    ["Successful 4th-inns chases", `${r.chasesWon}`, `of ${r.chasesTried} decided Tests with a 4th innings`],
    ["Highest successful chase", r.highestChase ? `${r.highestChase.runs}` : "none", r.highestChase ? `${r.highestChase.team}, ${r.highestChase.date.slice(0, 4)}` : ""],
  ];
  return (
    <div class="record">
      <h3 class="mini-h">
        Ground record
        <Info text="Tests at this ground that Cricsheet holds ball-by-ball, before this match. Cricsheet's men's Test coverage starts in Dec 2001 and misses some Tests, so counts are of the data, not of all Tests ever played here." />
      </h3>
      <dl class="facts">
        {facts.map(([k, v, s]) => (
          <div>
            <dt>{k}</dt>
            <dd>
              <span class="num">{v}</span> {s && <small>{s}</small>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
