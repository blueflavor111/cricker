import { useState } from "preact/hooks";
import { useMatch } from "./context";
import { useWidth } from "./useWidth";
import { code, names, ordinal, teamColor } from "./format";
import { envelope } from "../engine/context";
import { oversText, type InningsState } from "../engine/replay";
import { shortVenue } from "../engine/stats";
import { Name } from "./Name";

// Over-end points for an innings, ending at the exact ball for a part over.
function path(i: InningsState): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  i.overs.forEach((o, k) => pts.push([k === i.overs.length - 1 ? i.legal / 6 : o.over + 1, o.cum]));
  return pts;
}

const niceMax = (v: number) => {
  const step = v > 400 ? 100 : 50;
  return Math.max(step * 2, Math.ceil(v / step) * step);
};

export function Development() {
  const { bundle, state } = useMatch();
  const [ref, width] = useWidth<HTMLDivElement>(900);
  const [hover, setHover] = useState<number | null>(null);
  const cur = state.current;
  const n = cur.n;

  // Ground envelope when the ground has enough innings of this number;
  // otherwise the host country's.
  const venueEnv = envelope(bundle.history.venue, n, 6);
  const useVenue = venueEnv.length > 10;
  const env = useVenue ? venueEnv : envelope(bundle.history.country, n, 10);
  const place = useVenue ? shortVenue(bundle.match.venue.name).replace(/^the /, "The ") : bundle.match.venue.country;
  const envN = env[0]?.n ?? 0;

  const others = state.innings.filter((i) => i !== cur);
  const curPts = path(cur);
  const maxOver = Math.max(30, Math.ceil(cur.legal / 6) + 6, ...others.map((i) => Math.ceil(i.legal / 6)));
  const xMax = Math.min(Math.max(maxOver, 40), 200);
  const envIn = env.filter((p) => p.over <= xMax);
  const yMax = niceMax(Math.max(cur.runs, ...others.map((i) => i.runs), ...envIn.map((p) => p.p75)) * 1.05);

  const W = Math.max(300, width);
  const H = W < 560 ? 260 : 360;
  const m = { l: 44, r: W < 560 ? 70 : 96, t: 28, b: 34 };
  const x = (o: number) => m.l + ((W - m.l - m.r) * o) / xMax;
  const y = (r: number) => H - m.b - ((H - m.t - m.b) * r) / yMax;
  const line = (pts: [number, number][]) => pts.map(([a, b], k) => `${k ? "L" : "M"}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join("");
  const band = envIn.length ? `${line(envIn.map((p) => [p.over, p.p75]))}L${[...envIn].reverse().map((p) => `${x(p.over).toFixed(1)},${y(p.p25).toFixed(1)}`).join("L")}Z` : "";
  const yStep = yMax > 400 ? 100 : 50;
  const yTicks = Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, k) => k * yStep);
  const xStep = xMax > 120 ? 20 : 10;
  const xTicks = Array.from({ length: Math.floor(xMax / xStep) + 1 }, (_, k) => k * xStep);

  const atOver = (i: InningsState, k: number) => (k === 0 ? 0 : i.overs.find((o) => o.over === k - 1 && (o.over + 1) * 6 <= i.legal)?.cum ?? null);
  const hv = hover != null ? { k: hover, cur: atOver(cur, hover), env: env.find((p) => p.over === hover) } : null;
  const label = (i: InningsState) => `${code(i.team)} ${state.innings.filter((x) => x.team === i.team && x.n <= i.n).length === 1 ? "1st" : "2nd"}`;
  const lastEnv = envIn[envIn.length - 1];

  // End labels for every line, nudged apart so they never overlap.
  const ends = [...others.map((i) => ({ i, y: y(i.runs), text: `${label(i)} ${i.runs}${i.wickets < 10 ? `/${i.wickets}` : ""}`, cur: false })), { i: cur, y: y(cur.runs), text: `${cur.runs}/${cur.wickets}`, cur: true }]
    .map((e) => ({ ...e, x: x(e.i.legal / 6) }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (Math.abs(ends[k].x - ends[k - 1].x) < 70 && ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;

  // Wicket numbers above the dots, skipped where they would collide.
  let lastLabelX = -99;
  const fow = cur.fow.map((f) => {
    const px = x(f.legal / 6);
    const show = px - lastLabelX > 14;
    if (show) lastLabelX = px;
    return { f, px, show };
  });

  return (
    <section class="progress" aria-labelledby="dev-h">
      <header class="sec-head">
        <h2 id="dev-h">Innings progression</h2>
        <span class="sec-note">
          {cur.team}, {ordinal(n)} innings: cumulative runs by over against {ordinal(n)} innings {useVenue ? "at" : "in"} {place}
        </span>
      </header>
      <div class="prog-grid">
        <div>
          <ul class="legend">
            <li style={{ "--team": teamColor(bundle, cur.team) }}>
              <i class="k-line" /> {cur.team} now
            </li>
            {others.length > 0 && (
              <li>
                <i class="k-line k-other" /> earlier innings this match
              </li>
            )}
            {envIn.length > 0 && (
              <>
                <li>
                  <i class="k-band" /> middle half of past {ordinal(n)} innings {useVenue ? "here" : `in ${place}`}
                </li>
                <li>
                  <i class="k-med" /> their median
                </li>
              </>
            )}
            <li>
              <i class="k-wkt" /> wicket (number)
            </li>
          </ul>
          <div class="chart" ref={ref}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              role="img"
              aria-label={`${cur.team} ${cur.runs} for ${cur.wickets} after ${oversText(cur.legal)} overs. Shaded band: middle half of ${ordinal(n)} innings ${useVenue ? "at" : "in"} ${place}.`}
              onPointerMove={(e) => {
                const r = (e.currentTarget as SVGElement).getBoundingClientRect();
                const scale = W / r.width;
                const o = Math.round((((e.clientX - r.left) * scale - m.l) / (W - m.l - m.r)) * xMax);
                setHover(o >= 0 && o <= xMax ? o : null);
              }}
              onPointerLeave={() => setHover(null)}
            >
              {yTicks.map((t) => (
                <g>
                  <line class={t === 0 ? "axis-line" : "grid"} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
                  <text class="axis" x={m.l - 8} y={y(t) + 4} text-anchor="end">
                    {t}
                  </text>
                </g>
              ))}
              {xTicks.map((t) => (
                <text class="axis" x={x(t)} y={H - m.b + 18} text-anchor="middle">
                  {t}
                </text>
              ))}
              <text class="axis-title" x={(m.l + W - m.r) / 2} y={H - 2} text-anchor="middle">
                Overs
              </text>
              <text class="axis-title" x={m.l - 8} y={12} text-anchor="end">
                Runs
              </text>
              {band && <path class="env-band" d={band} />}
              {envIn.length > 1 && <path class="env-mid" d={line(envIn.map((p) => [p.over, p.p50]))} />}
              {lastEnv && W >= 560 && (
                <text class="env-label" x={x(lastEnv.over) + 6} y={y(lastEnv.p50) + 4}>
                  median {Math.round(lastEnv.p50)}
                </text>
              )}
              {others.map((i) => (
                <g style={{ "--team": teamColor(bundle, i.team) }}>
                  <path class="other-line" d={line(path(i))} />
                </g>
              ))}
              <g style={{ "--team": teamColor(bundle, cur.team) }}>
                <path class="cur-line" d={line(curPts)} />
                {fow.map(({ f, px, show }) => (
                  <g>
                    <circle class="wkt-dot" cx={px} cy={y(f.runs)} r={4.5}>
                      <title>
                        {f.wicket}-{f.runs}: {names(bundle).full(f.out)} ({f.label})
                      </title>
                    </circle>
                    {show && (
                      <text class="wkt-no" x={px} y={y(f.runs) - 9} text-anchor="middle">
                        {f.wicket}
                      </text>
                    )}
                  </g>
                ))}
                <circle class="cur-end" cx={x(cur.legal / 6)} cy={y(cur.runs)} r={4} />
              </g>
              {ends.map((e) => (
                <text class={`end-label ${e.cur ? "is-cur" : ""}`} x={e.x + 8} y={e.y + 4} style={{ "--team": teamColor(bundle, e.i.team) }}>
                  {e.text}
                </text>
              ))}
              {hv && <line class="cross" x1={x(hv.k)} x2={x(hv.k)} y1={m.t} y2={H - m.b} />}
            </svg>
            {hv && (
              <div class="chart-tip num" style={{ left: `${Math.min((100 * x(hv.k)) / W, 70)}%` }}>
                <b>After {hv.k} overs</b>
                <div>
                  {cur.team}: {hv.cur == null ? "not reached" : hv.cur}
                </div>
                {hv.env && (
                  <div>
                    Past {ordinal(n)} innings: median {Math.round(hv.env.p50)}, middle half {Math.round(hv.env.p25)}–{Math.round(hv.env.p75)} ({hv.env.n} innings)
                  </div>
                )}
                {others.map((i) => {
                  const v = atOver(i, hv.k);
                  return v == null ? null : (
                    <div>
                      {label(i)}: {v}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p class="fig-note">
            The band uses {envN} past {ordinal(n)} innings {useVenue ? "at" : "in"} {place}, measured at the end of each over while they were still going. It stops once
            fewer than {useVenue ? 6 : 10} were still going, so late overs describe the innings that lasted, not all of them.
          </p>
        </div>
        <Partnerships />
      </div>
    </section>
  );
}

function Partnerships() {
  const { bundle, state } = useMatch();
  const cur = state.current;
  if (!cur.partnerships.length) return null;
  const max = Math.max(50, ...cur.partnerships.map((p) => p.runs));
  return (
    <div class="partnerships">
      <h3 class="sub-h">Partnerships</h3>
      <table class="table compact">
        <thead>
          <tr>
            <th scope="col">Wkt</th>
            <th scope="col">Batters</th>
            <th scope="col">Runs</th>
            <th scope="col">
              <span class="sr">Share</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cur.partnerships.map((p) => {
            const a = p.contrib[p.a] ?? 0;
            const b = p.contrib[p.b] ?? 0;
            const extras = Math.max(0, p.runs - a - b);
            return (
              <tr class={!p.broken ? "is-live" : ""} style={{ "--team": teamColor(bundle, cur.team) }}>
                <td>{ordinal(p.wicket)}</td>
                <th scope="row" class="p-names">
                  <Name id={p.a} short /> <span class="muted">{a}</span>, <Name id={p.b} short /> <span class="muted">{b}</span>
                </th>
                <td>
                  {p.runs}
                  {!p.broken && "*"} <small>({p.balls})</small>
                </td>
                <td class="p-bar-cell">
                  <span class="p-bar" title={`${p.runs} runs off ${p.balls} balls${extras ? `, ${extras} extras` : ""}`}>
                    <span class="pa" style={{ width: `${(100 * a) / max}%` }} />
                    <span class="pb" style={{ width: `${(100 * b) / max}%` }} />
                    <span class="px" style={{ width: `${(100 * extras) / max}%` }} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
