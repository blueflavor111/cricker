import { useMatch } from "./context";
import { useWidth } from "./useWidth";
import { Name } from "./Name";
import { fx, fpct, names, teamColor } from "./format";
import { averageRange, average, ballsPer, pct, strikeRate, type BatAgg } from "../engine/definitions";
import { batAgg, bowlAgg, h2hAgg, meetings, type Scope, type ScopeId } from "../engine/stats";
import { oversText } from "../engine/replay";

// The three windows most people want; the rest sit in a selector beside them.
const PRIMARY: ScopeId[] = ["career", "series", "match"];

// The batter who faced the last ball against the bowler who bowled it, with
// their record. The pairing is the last delivery's: what was known at that
// moment, never the next ball.
export function Contest() {
  const { bundle, state, rows, scope: scopeId, scopes } = useMatch();
  const bat = state.ball.bat;
  const bowl = state.ball.bowl;
  const n = names(bundle);
  const scope = scopes.find((s) => s.id === scopeId) ?? scopes[0];
  const h = h2hAgg(bundle, rows, bat, bowl, scope);
  const cur = state.current;
  const bi = cur.batters.find((b) => b.id === bat)!;
  const wi = cur.bowlers.find((b) => b.id === bowl)!;
  const out = state.ball.w?.find((w) => w.out === bat);
  const batTeam = cur.team;
  const bowlTeam = bundle.match.teams.find((t) => t !== batTeam)!;

  return (
    <section class="contest" aria-labelledby="contest-h">
      <header class="sec-head">
        <h2 id="contest-h">The contest</h2>
        <span class="sec-note num">{state.status === "final" ? "final delivery of the match" : `as of ${state.ball.label}, ${cur.team} ${ordinalInns(cur.n)}`}</span>
      </header>

      <div class="ct-names">
        <div class="ct-p" style={{ "--team": teamColor(bundle, batTeam) }}>
          <span class="ct-role">
            <i class="sw" />
            {batTeam}, batting
          </span>
          <Name id={bat} class="ct-name" />
          <span class="ct-today num">
            {bi.runs}
            {out ? "" : "*"} off {bi.balls} {out ? <span class="wkt-text">out {out.k}</span> : "today"}
          </span>
        </div>
        <span class="ct-v" aria-hidden="true">
          v
        </span>
        <div class="ct-p" style={{ "--team": teamColor(bundle, bowlTeam) }}>
          <span class="ct-role">
            <i class="sw" />
            {bowlTeam}, bowling
          </span>
          <Name id={bowl} class="ct-name" />
          <span class="ct-today num">
            {wi.wickets}–{wi.runs} off {oversText(wi.balls)} overs today
          </span>
        </div>
      </div>

      <ScopeControl />
      <p class="ct-window">{scope.hint}.</p>

      {h.balls === 0 ? (
        <p class="empty">
          {n.short(bowl)} has not bowled to {n.short(bat)} {scope.id === "career" ? "in any Test in the data" : `in this window`}.
          {scope.id !== "career" && " Career covers every Test in the data."}
        </p>
      ) : (
        <>
          <Figures h={h} />
          <SampleNote h={h} bowler={n.short(bowl)} />
          <Sources bat={bat} bowl={bowl} scope={scope} />
        </>
      )}
      <MatchupTable bat={bat} bowl={bowl} />
      {h.balls > 0 && (
        <div class="ct-pair">
          <RangePlot h={h} bat={bat} bowl={bowl} scope={scope} />
          <ScoringShape h={h} bat={bat} scope={scope} bowlerShort={n.short(bowl)} />
        </div>
      )}
      <Meetings bat={bat} bowl={bowl} />
    </section>
  );
}

const ordinalInns = (k: number) => `${["1st", "2nd", "3rd", "4th"][k - 1]} innings`;

function ScopeControl() {
  const { scopes, scope, setScope } = useMatch();
  const others = scopes.filter((s) => !PRIMARY.includes(s.id));
  const inOthers = others.some((s) => s.id === scope);
  return (
    <div class="ct-scope">
      <div class="seg" role="radiogroup" aria-label="Window">
        {PRIMARY.map((id) => {
          const s = scopes.find((x) => x.id === id);
          return (
            s && (
              <button type="button" role="radio" aria-checked={s.id === scope} title={s.hint} onClick={() => setScope(s.id)}>
                {s.label}
              </button>
            )
          );
        })}
      </div>
      <label class={`ct-other ${inOthers ? "is-active" : ""}`}>
        <span>Other windows</span>
        <select class="select" value={inOthers ? scope : ""} onChange={(e) => setScope((e.target as HTMLSelectElement).value as ScopeId)}>
          {!inOthers && <option value="">Choose…</option>}
          {others.map((s) => (
            <option value={s.id}>{s.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Figures({ h }: { h: BatAgg }) {
  const avg = average(h.runs, h.outs);
  const primary: [string, string][] = [
    ["Balls", String(h.balls)],
    ["Runs", String(h.runs)],
    ["Dismissals", String(h.outs)],
    ["Average", avg == null ? "–" : fx(avg)],
  ];
  const secondary: [string, string][] = [
    ["Strike rate", fx(strikeRate(h.runs, h.balls))],
    ["Dot balls", fpct(pct(h.dots, h.balls))],
    ["Boundary every", h.fours + h.sixes ? `${fx(ballsPer(h.balls, h.fours + h.sixes))} balls` : "no boundaries"],
    ["Balls per dismissal", h.outs ? fx(ballsPer(h.balls, h.outs)) : "–"],
    ["Tests", String(h.matches)],
  ];
  return (
    <div class="figs">
      <dl class="figs-1">
        {primary.map(([k, v]) => (
          <div>
            <dt>{k}</dt>
            <dd class="num">{v}</dd>
          </div>
        ))}
      </dl>
      <dl class="figs-2">
        {secondary.map(([k, v]) => (
          <div>
            <dt>{k}</dt>
            <dd class="num">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// One factual line on how much the figures rest on.
function SampleNote({ h, bowler }: { h: BatAgg; bowler: string }) {
  const r = averageRange(h.runs, h.balls, h.outs);
  const base = `${h.balls} balls across ${h.matches} Test${h.matches === 1 ? "" : "s"}`;
  let text: string;
  if (h.outs === 0) text = `Not dismissed by ${bowler} in ${base}, so there is no average; strike rate and dot balls are the better guide.`;
  else if (h.outs < 10 && r)
    text = `${h.outs} dismissal${h.outs === 1 ? "" : "s"} in ${base}. With so few, the average is consistent with an underlying rate anywhere from ${fx(r.low, 0)} to ${r.high == null ? "no upper limit" : fx(r.high, 0)} (90% range).`;
  else text = `${h.outs} dismissals in ${base}.`;
  return <p class={`ct-note ${h.outs < 5 ? "is-thin" : ""}`}>{text}</p>;
}

// Splits the window into before this series, earlier in this series and this
// match, so it is obvious how much of a figure is history and how much is today.
function Sources({ bat, bowl, scope }: { bat: string; bowl: string; scope: Scope }) {
  const { bundle, rows } = useMatch();
  const key = bundle.match.series.key;
  const parts: { k: string; label: string; s: Scope }[] = [
    { k: "hist", label: "Before this series", s: { ...scope, current: false, prior: (m) => scope.prior(m) && (!key || m.series !== key) } },
    { k: "series", label: "Earlier this series", s: { ...scope, current: false, prior: (m) => !!key && scope.prior(m) && m.series === key } },
    { k: "match", label: "This match", s: { ...scope, prior: () => false } },
  ];
  const aggs = parts.map((p) => ({ ...p, a: h2hAgg(bundle, rows, bat, bowl, p.s) }));
  const total = aggs.reduce((t, p) => t + p.a.balls, 0);
  if (!total) return null;
  return (
    <div class="sources">
      <div class="src-bar" role="img" aria-label={aggs.map((p) => `${p.label}: ${p.a.balls} balls`).join("; ")}>
        {aggs.map((p) => p.a.balls > 0 && <span class={`src-${p.k}`} style={{ flexGrow: p.a.balls }} />)}
      </div>
      <ul class="src-key num">
        {aggs.map((p) => (
          <li class={p.a.balls ? "" : "is-empty"}>
            <i class={`src-${p.k}`} />
            <span class="src-label">{p.label}</span>
            {p.a.balls ? (
              <span>
                {p.a.runs} off {p.a.balls}, {p.a.outs} out
              </span>
            ) : (
              <span class="muted">none</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatchupTable({ bat, bowl }: { bat: string; bowl: string }) {
  const { bundle, rows, scopes, scope, setScope } = useMatch();
  const n = names(bundle);
  const career = scopes.find((s) => s.id === "career")!;
  const lines = scopes.map((s) => ({ s, a: h2hAgg(bundle, rows, bat, bowl, s) }));
  const byInnings = [1, 2, 3, 4].map((i) => ({ label: `${ordinalInns(i)} of a Test`, a: h2hAgg(bundle, rows, bat, bowl, career, { innings: [i] }) }));
  return (
    <div class="mt">
      <h3 class="sub-h">
        {n.short(bat)} v {n.short(bowl)}, every window
      </h3>
      <div class="scroll">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Window</th>
              <th scope="col">Balls</th>
              <th scope="col">Runs</th>
              <th scope="col">Out</th>
              <th scope="col">Avg</th>
              <th scope="col">SR</th>
              <th scope="col">Dot %</th>
              <th scope="col">Bdry %</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(({ s, a }) => (
              <tr class={`is-clickable ${s.id === scope ? "is-selected" : ""}`} onClick={() => setScope(s.id)} aria-selected={s.id === scope}>
                <th scope="row">
                  <button type="button" class="row-btn" onClick={(e) => (e.stopPropagation(), setScope(s.id))}>
                    {s.label}
                  </button>
                </th>
                <Cells a={a} />
              </tr>
            ))}
            <tr class="group">
              <th colSpan={8} scope="rowgroup">
                Career, by innings of the match
              </th>
            </tr>
            {byInnings.map(({ label, a }) => (
              <tr>
                <th scope="row">{label}</th>
                <Cells a={a} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Cells({ a }: { a: BatAgg }) {
  if (a.balls === 0)
    return (
      <td colSpan={7} class="none">
        no deliveries
      </td>
    );
  const avg = average(a.runs, a.outs);
  return (
    <>
      <td>{a.balls}</td>
      <td>{a.runs}</td>
      <td>{a.outs}</td>
      <td>{avg == null ? <span class="muted">–</span> : fx(avg)}</td>
      <td>{fx(strikeRate(a.runs, a.balls))}</td>
      <td>{fpct(pct(a.dots, a.balls))}</td>
      <td>{fpct(pct(a.fours + a.sixes, a.balls))}</td>
    </>
  );
}

// The head-to-head average against the batter's usual average and the
// bowler's usual cost, with the 90% range around the head-to-head.
function RangePlot({ h, bat, bowl, scope }: { h: BatAgg; bat: string; bowl: string; scope: Scope }) {
  const { bundle, rows } = useMatch();
  const [ref, width] = useWidth<HTMLDivElement>(360);
  const n = names(bundle);
  const base = batAgg(bundle, rows, bat, scope, "bowler");
  const bw = bowlAgg(bundle, rows, bowl, scope);
  const baseline = average(base.runs, base.outs);
  const bowlAvg = bw.wickets ? bw.runs / bw.wickets : null;
  const r = averageRange(h.runs, h.balls, h.outs);
  const avg = average(h.runs, h.outs);
  const max = Math.max(80, Math.ceil(Math.max(baseline ?? 0, bowlAvg ?? 0, avg ?? 0) * 1.4 / 20) * 20);
  const W = Math.max(240, width);
  const m = { l: 6, r: 6 };
  const x = (v: number) => m.l + ((W - m.l - m.r) * Math.min(v, max)) / max;
  const H = 104;
  const yTrack = 46;
  const anchor = (px: number) => (px < 60 ? "start" : px > W - 60 ? "end" : "middle");
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const B = n.short(bat);
  const Wn = n.short(bowl);
  return (
    <figure class="range" ref={ref}>
      <figcaption class="sub-h">Average in context</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${B}'s average against ${Wn}: ${avg == null ? "not dismissed" : fx(avg)}. ${B}'s average against all bowlers in this window: ${fx(baseline)}. ${Wn}'s bowling average: ${fx(bowlAvg)}.`}>
        {r && <rect class="rg-band" x={x(r.low)} y={yTrack - 7} width={Math.max(2, x(r.high ?? max) - x(r.low))} height={14} />}
        <line class="rg-axis" x1={m.l} x2={W - m.r} y1={yTrack} y2={yTrack} />
        {ticks.map((t) => (
          <text class="rg-tick" x={x(t)} y={yTrack + 26} text-anchor={t === 0 ? "start" : t === max ? "end" : "middle"}>
            {Math.round(t)}
            {t === max && r?.high != null && r.high > max ? "+" : ""}
          </text>
        ))}
        {baseline != null && (
          <g class="rg-bat">
            <line x1={x(baseline)} x2={x(baseline)} y1={14} y2={yTrack + 9} />
            <text x={x(baseline)} y={10} text-anchor={anchor(x(baseline))}>
              {B} v all bowlers {fx(baseline)}
            </text>
          </g>
        )}
        {bowlAvg != null && (
          <g class="rg-bowl">
            <line x1={x(bowlAvg)} x2={x(bowlAvg)} y1={yTrack - 9} y2={yTrack + 12} />
            <text x={x(bowlAvg)} y={H - 4} text-anchor={anchor(x(bowlAvg))}>
              {Wn}'s bowling average {fx(bowlAvg)}
            </text>
          </g>
        )}
        {avg != null && <circle class="rg-dot" cx={x(avg)} cy={yTrack} r={5.5} />}
      </svg>
      <p class="fig-note">
        <i class="k-dot" /> {B} v {Wn} {avg == null ? "(not dismissed)" : fx(avg)} <i class="k-band" /> 90% range
        {r ? ` ${fx(r.low, 0)}–${r.high == null ? "∞" : fx(r.high, 0)}` : ""}. Averages use bowler-credited dismissals only.
      </p>
    </figure>
  );
}

const SHAPE = [
  ["dots", "Dot"],
  ["ones", "1"],
  ["twos", "2"],
  ["threes", "3"],
  ["fours", "4"],
  ["sixes", "6"],
] as const;

function ScoringShape({ h, bat, scope, bowlerShort }: { h: BatAgg; bat: string; scope: Scope; bowlerShort: string }) {
  const { bundle, rows } = useMatch();
  const base = batAgg(bundle, rows, bat, scope, "bowler");
  return (
    <figure class="shape">
      <figcaption class="sub-h">Scoring shots, share of balls</figcaption>
      <table class="table shape-t">
        <thead>
          <tr>
            <th scope="col">
              <span class="sr">Against</span>
            </th>
            {SHAPE.map(([, l]) => (
              <th scope="col">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(
            [
              [`v ${bowlerShort}`, h],
              ["v all", base],
            ] as [string, BatAgg][]
          ).map(([label, a]) => (
            <tr>
              <th scope="row">{label}</th>
              {SHAPE.map(([k]) => (
                <td>{fpct(pct(a[k], a.balls))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div class="shape-bar" aria-hidden="true">
        {SHAPE.map(([k]) => h[k] > 0 && <span class={`seg-${k}`} style={{ flexGrow: h[k] }} />)}
      </div>
      <p class="fig-note">Byes and leg byes count as dots for the batter; 5s and run fours are left out.</p>
    </figure>
  );
}

function Meetings({ bat, bowl }: { bat: string; bowl: string }) {
  const { bundle, rows } = useMatch();
  const ms = meetings(bundle, rows, bat, bowl);
  if (!ms.length) return null;
  const maxBalls = Math.max(...ms.map((m) => m.balls), 1);
  return (
    <figure class="meetings">
      <figcaption class="sub-h">Test by Test</figcaption>
      <div class="meet-cols">
        {ms.map((m) => (
          <div class={`meet ${m.current ? "is-current" : ""}`} title={`${m.venue}, ${m.date}: ${m.runs} off ${m.balls}, out ${m.outs}`}>
            <span class="meet-runs num">
              {m.runs}
              <small>/{m.balls}</small>
            </span>
            <span class="meet-plot">
              <span class="meet-bar" style={{ height: `${Math.max(2, (100 * m.balls) / maxBalls)}%` }} />
            </span>
            <span class="meet-outs" aria-label={`${m.outs} dismissals`}>
              {Array.from({ length: m.outs }).map(() => (
                <i />
              ))}
            </span>
            <span class="meet-label">{m.label}</span>
          </div>
        ))}
      </div>
      <p class="fig-note">Bar height is balls faced; the label is runs/balls; red marks are dismissals by this bowler.</p>
    </figure>
  );
}
