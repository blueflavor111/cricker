import { useState } from "preact/hooks";
import { useMatch } from "./context";
import { useWidth } from "./useWidth";
import { code, names, ordinal, teamColor } from "./format";
import { envelope } from "../engine/context";
import { oversText, type InningsState } from "../engine/replay";
import { shortVenue } from "../engine/stats";
import { Info } from "./Info";
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
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const cur = state.current;
  const n = cur.n;

  // Ground envelope when the ground has enough innings of this number;
  // otherwise the host country's.
  const venueEnv = envelope(bundle.history.venue, n, 6);
  const useVenue = venueEnv.length > 10;
  const env = useVenue ? venueEnv : envelope(bundle.history.country, n, 10);
  const envSource = useVenue ? `at ${shortVenue(bundle.match.venue.name)}` : `in ${bundle.match.venue.country}`;
  const envN = env[0]?.n ?? 0;

  const others = state.innings.filter((i) => i !== cur);
  const curPts = path(cur);
  const maxOver = Math.max(30, Math.ceil(cur.legal / 6) + 6, ...others.map((i) => Math.ceil(i.legal / 6)));
  const xMax = Math.min(Math.max(maxOver, 40), 200);
  const envIn = env.filter((p) => p.over <= xMax);
  const yMax = niceMax(Math.max(cur.runs, ...others.map((i) => i.runs), ...envIn.map((p) => p.p75)) * 1.05);

  const H = width < 560 ? 220 : 280;
  const m = { l: 40, r: 64, t: 12, b: 28 };
  const x = (o: number) => m.l + ((width - m.l - m.r) * o) / xMax;
  const y = (r: number) => H - m.b - ((H - m.t - m.b) * r) / yMax;
  const line = (pts: [number, number][]) => pts.map(([a, b], k) => `${k ? "L" : "M"}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join("");
  const band = envIn.length ? `${line(envIn.map((p) => [p.over, p.p75]))}L${[...envIn].reverse().map((p) => `${x(p.over).toFixed(1)},${y(p.p25).toFixed(1)}`).join("L")}Z` : "";
  const yTicks = Array.from({ length: 5 }, (_, k) => (yMax * k) / 4);
  const xStep = xMax > 120 ? 40 : xMax > 60 ? 20 : 10;
  const xTicks = Array.from({ length: Math.floor(xMax / xStep) + 1 }, (_, k) => k * xStep);

  const atOver = (i: InningsState, k: number) => (k === 0 ? 0 : i.overs.find((o) => o.over === k - 1 && (o.over + 1) * 6 <= i.legal)?.cum ?? null);
  const hv = hover != null ? { k: hover, cur: atOver(cur, hover), env: env.find((p) => p.over === hover) } : null;
  const label = (i: InningsState) => `${code(i.team)} ${state.innings.filter((x) => x.team === i.team && x.n <= i.n).length === 1 ? "1st" : "2nd"}`;

  return (
    <section class="panel development" aria-labelledby="dev-h">
      <h2 id="dev-h" class="kicker">
        How the innings is building
        <span class="kicker-sub">
          runs by over, {ordinal(n)} innings
        </span>
      </h2>
      <div class="chart" ref={ref}>
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`${cur.team} ${cur.runs} for ${cur.wickets} after ${oversText(cur.legal)} overs. Shaded band: middle half of ${ordinal(n)} innings ${envSource}.`}
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGElement).getBoundingClientRect();
            const o = Math.round(((e.clientX - r.left - m.l) / (width - m.l - m.r)) * xMax);
            setHover(o >= 0 && o <= xMax ? o : null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((t) => (
            <g>
              <line class="grid" x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
              <text class="axis" x={m.l - 6} y={y(t) + 4} text-anchor="end">
                {t}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text class="axis" x={x(t)} y={H - 8} text-anchor="middle">
              {t}
            </text>
          ))}
          <text class="axis" x={width - m.r} y={H - 8} text-anchor="start" dx="6">
            overs
          </text>
          {band && <path class="env-band" d={band} />}
          {envIn.length > 1 && <path class="env-mid" d={line(envIn.map((p) => [p.over, p.p50]))} />}
          {others.map((i) => {
            const pts = path(i);
            const [lx, ly] = pts[pts.length - 1];
            return (
              <g style={{ "--team": teamColor(bundle, i.team) }}>
                <path class="other-line" d={line(pts)} />
                <text class="end-label muted-label" x={x(lx) + 6} y={y(ly) + 4}>
                  {label(i)} {i.runs}
                  {i.wickets < 10 ? `/${i.wickets}` : ""}
                </text>
              </g>
            );
          })}
          <g style={{ "--team": teamColor(bundle, cur.team) }}>
            <path class="cur-line" d={line(curPts)} />
            {cur.fow.map((f) => (
              <circle class="wkt-dot" cx={x(f.legal / 6)} cy={y(f.runs)} r={4.5}>
                <title>
                  {f.wicket}-{f.runs}: {names(bundle).full(f.out)} ({f.label})
                </title>
              </circle>
            ))}
            <circle class="cur-end" cx={x(cur.legal / 6)} cy={y(cur.runs)} r={4.5} />
            <text class="end-label" x={x(cur.legal / 6) + 8} y={y(cur.runs) + 4}>
              {cur.runs}/{cur.wickets}
            </text>
          </g>
          {hv && (
            <g class="cross">
              <line x1={x(hv.k)} x2={x(hv.k)} y1={m.t} y2={H - m.b} />
            </g>
          )}
        </svg>
        {hv && (
          <div class="chart-tip" style={{ left: `${Math.min(x(hv.k) + 10, width - 190)}px` }}>
            <b>After {hv.k} overs</b>
            <div>
              {code(cur.team)} {hv.cur == null ? "–" : hv.cur}
            </div>
            {hv.env && (
              <div class="muted">
                Typical {envSource}: {Math.round(hv.env.p25)}–{Math.round(hv.env.p75)} (median {Math.round(hv.env.p50)}, {hv.env.n} innings)
              </div>
            )}
            {others.map((i) => {
              const v = atOver(i, hv.k);
              return v == null ? null : (
                <div class="muted">
                  {label(i)}: {v}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p class="chart-note">
        <span class="key-band" /> Middle half of {ordinal(n)} innings {envSource} ({envN} innings in the data; thins out late, so the band stops once fewer than {useVenue ? 6 : 10} were still going).{" "}
        <span class="key-dot" /> wickets.
        <Info text="Each past innings is measured at the end of each over while it was still going. Long innings survive to the right of the chart, so the band there describes the innings that lasted, not all of them." />
      </p>
      <Partnerships />
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
      <h3 class="mini-h">Partnerships</h3>
      <ol>
        {cur.partnerships.map((p) => {
          const a = p.contrib[p.a] ?? 0;
          const b = p.contrib[p.b] ?? 0;
          const extras = p.runs - a - b;
          return (
            <li class={!p.broken ? "is-live" : ""} style={{ "--team": teamColor(bundle, cur.team) }}>
              <span class="p-wkt num">{ordinal(p.wicket)}</span>
              <span class="p-names">
                <Name id={p.a} short /> <span class="num muted">{a}</span> · <Name id={p.b} short /> <span class="num muted">{b}</span>
              </span>
              <span class="p-bar" title={`${p.runs} runs off ${p.balls} balls${extras ? `, ${extras} extras` : ""}`}>
                <span class="pa" style={{ width: `${(100 * a) / max}%` }} />
                <span class="pb" style={{ width: `${(100 * b) / max}%` }} />
                <span class="px" style={{ width: `${(100 * Math.max(0, extras)) / max}%` }} />
              </span>
              <span class="p-runs num">
                {p.runs}
                {!p.broken && "*"} <small>({p.balls})</small>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
