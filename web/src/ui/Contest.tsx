import { useMatch } from "./context";
import { Name } from "./Name";
import { fx, fpct, names, teamColor, code } from "./format";
import { averageRange, average, edge, evidence, EVIDENCE_TEXT, pct, strikeRate, type BatAgg, type AverageRange } from "../engine/definitions";
import { batAgg, bowlAgg, h2hAgg, meetings, type Scope } from "../engine/stats";
import { oversText } from "../engine/replay";
import { Info } from "./Info";

// The batter on strike against the bowler, with their history. The pairing is
// the last delivery's: what was known at that moment, never the next ball.
export function Contest() {
  const { bundle, state, rows, scope: scopeId, scopes, setScope } = useMatch();
  const bat = state.ball.bat;
  const bowl = state.ball.bowl;
  const n = names(bundle);
  const scope = scopes.find((s) => s.id === scopeId) ?? scopes[0];
  const h = h2hAgg(bundle, rows, bat, bowl, scope);
  const base = batAgg(bundle, rows, bat, scope, "bowler");
  const bowlBase = bowlAgg(bundle, rows, bowl, scope);
  const cur = state.current;
  const bi = cur.batters.find((b) => b.id === bat)!;
  const wi = cur.bowlers.find((b) => b.id === bowl)!;
  const out = state.ball.w?.find((w) => w.out === bat);
  const batTeam = cur.team;
  const bowlTeam = bundle.match.teams.find((t) => t !== batTeam)!;

  return (
    <section class="panel contest" aria-labelledby="contest-h">
      <h2 id="contest-h" class="kicker">
        The contest <span class="kicker-sub">{state.status === "final" ? "final delivery" : `after ${state.ball.label}`}</span>
      </h2>
      <div class="vs">
        <div class="side" style={{ "--team": teamColor(bundle, batTeam) }}>
          <span class="role">{code(batTeam)} · batting</span>
          <Name id={bat} class="big-name" />
          <span class="now num">
            {bi.runs}
            {out ? "" : "*"} ({bi.balls}) {out && <span class="out-tag">out {out.k}</span>}
          </span>
        </div>
        <span class="v" aria-hidden="true">v</span>
        <div class="side right" style={{ "--team": teamColor(bundle, bowlTeam) }}>
          <span class="role">{code(bowlTeam)} · bowling</span>
          <Name id={bowl} class="big-name" />
          <span class="now num">
            {wi.wickets}–{wi.runs} ({oversText(wi.balls)})
          </span>
        </div>
      </div>

      <div class="scopes" role="radiogroup" aria-label="Time window">
        {scopes.map((s) => (
          <button type="button" role="radio" aria-checked={s.id === scope.id} title={s.hint} onClick={() => setScope(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {h.balls === 0 ? (
        <p class="empty">
          No recorded deliveries from {n.short(bowl)} to {n.short(bat)} {scope.id === "career" ? "in Tests" : `in this window (${scope.label.toLowerCase()})`}.
          {scope.id !== "career" && " Try Career."}
        </p>
      ) : (
        <>
          <Figures h={h} />
          <EdgeChart h={h} base={base} bowlBase={bowlBase.wickets ? bowlBase.runs / bowlBase.wickets : null} bat={bat} bowl={bowl} scope={scope} />
          <div class="contest-grid">
            <ScoringShape h={h} base={base} bowlerShort={n.short(bowl)} />
            <Meetings bat={bat} bowl={bowl} />
          </div>
        </>
      )}
      <Splits bat={bat} bowl={bowl} />
    </section>
  );
}

function Figures({ h }: { h: BatAgg }) {
  const ev = evidence(h.balls, h.outs);
  const avg = average(h.runs, h.outs);
  const items: [string, string, string?][] = [
    ["Balls", String(h.balls)],
    ["Runs", String(h.runs)],
    ["Dismissed", String(h.outs), "Bowled, caught, lbw, stumped or hit wicket off this bowler. Run outs don't count against the bowler."],
    ["Average", avg == null ? "not out" : fx(avg), "Runs off the bat per dismissal. No dismissals means no average, not zero."],
    ["Strike rate", fx(strikeRate(h.runs, h.balls)), "Runs off the bat per 100 balls faced. Wides aren't balls faced; no-balls are."],
    ["Dot balls", fpct(pct(h.dots, h.balls)), "Balls faced with no run off the bat, including the ball he was out to."],
    ["Boundaries", fpct(pct(h.fours + h.sixes, h.balls)), "Share of balls faced hit for four or six (run fours excluded)."],
  ];
  return (
    <>
      <dl class="figures">
        {items.map(([k, v, tip]) => (
          <div>
            <dt>
              {k}
              {tip && <Info text={tip} />}
            </dt>
            <dd class="num">{v}</dd>
          </div>
        ))}
      </dl>
      <p class={`evidence ev-${ev}`}>
        <EvidenceMeter outs={h.outs} />
        <span>
          <b>{EVIDENCE_TEXT[ev]}</b>: {h.outs} dismissal{h.outs === 1 ? "" : "s"} in {h.balls} balls across {h.matches} Test{h.matches === 1 ? "" : "s"}.
        </span>
      </p>
    </>
  );
}

// Five pips: how many dismissals the figure rests on, on a 1/5/10/20 scale.
export function EvidenceMeter({ outs }: { outs: number }) {
  const lit = outs >= 20 ? 5 : outs >= 10 ? 4 : outs >= 5 ? 3 : outs >= 2 ? 2 : outs >= 1 ? 1 : 0;
  return (
    <span class="meter" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <i class={i < lit ? "on" : ""} />
      ))}
    </span>
  );
}

function EdgeChart({ h, base, bowlBase, bat, bowl, scope }: { h: BatAgg; base: BatAgg; bowlBase: number | null; bat: string; bowl: string; scope: Scope }) {
  const { bundle } = useMatch();
  const n = names(bundle);
  const range = averageRange(h.runs, h.balls, h.outs);
  const baseline = average(base.runs, base.outs);
  const verdict = edge(range, baseline, h.balls, h.outs);
  const avg = average(h.runs, h.outs);
  const max = Math.max(80, Math.ceil(((baseline ?? 0) * 1.6) / 20) * 20);
  const x = (v: number) => `${(100 * Math.min(v, max)) / max}%`;
  const B = n.short(bat);
  const W = n.short(bowl);
  const r = range as AverageRange;

  let text: string;
  if (verdict === "insufficient") text = `Too little evidence to say who has had the upper hand.`;
  else if (verdict === "bowler") text = `${W} has had the better of it: even the top of the plausible range is below ${B}'s usual ${fx(baseline)}.`;
  else if (verdict === "batter") text = `${B} has had the better of it: even the bottom of the plausible range is above ${B}'s usual ${fx(baseline)}.`;
  else text = `No clear edge: the plausible range includes ${B}'s usual ${fx(baseline)}.`;

  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  return (
    <figure class="edge">
      <figcaption>
        <span class="tag-model">Interpretation</span> {text}
        <Info text={`The band is a 90% range for ${B}'s average against ${W} if dismissals arrive at a steady rate per ball (an exact Poisson interval on ${h.outs} dismissals in ${h.balls} balls). "Usual" is ${B}'s runs per bowler-credited dismissal against all bowlers in the same window (${scope.label.toLowerCase()}), so run outs don't flatter either side. A verdict needs the whole band on one side.`} />
      </figcaption>
      <div class="edge-plot" role="img" aria-label={`${B}'s average against ${W}: ${avg == null ? "never dismissed" : fx(avg)}, plausible range ${fx(r.low)} to ${r.high == null ? "unbounded" : fx(r.high)}; usual average ${fx(baseline)}.`}>
        <div class="edge-labels">
          {baseline != null && (
            <span class="edge-ref-label" style={{ left: x(baseline) }}>
              {B} usual <b class="num">{fx(baseline)}</b>
            </span>
          )}
          {bowlBase != null && (
            <span class={`edge-ref-label ${baseline != null && Math.abs(Math.min(baseline, max) - Math.min(bowlBase, max)) < max * 0.25 ? "up" : ""}`} style={{ left: x(bowlBase) }}>
              {W} bowling avg <b class="num">{fx(bowlBase)}</b>
            </span>
          )}
        </div>
        <div class="edge-track">
          <span class={`edge-band ${r.high == null || r.high > max ? "open" : ""}`} style={{ left: x(r.low), width: `calc(${x(r.high ?? max)} - ${x(r.low)})` }} />
          {baseline != null && <span class="edge-ref bat" style={{ left: x(baseline) }} />}
          {bowlBase != null && <span class="edge-ref bowl" style={{ left: x(bowlBase) }} />}
          {avg != null && <span class="edge-dot" style={{ left: x(avg) }} title={`Observed ${fx(avg)}`} />}
        </div>
        <div class="edge-axis">
          {ticks.map((t) => (
            <span class="edge-tick num" style={{ left: x(t) }}>
              {Math.round(t)}
            </span>
          ))}
        </div>
        <div class="edge-legend">
          <span>
            <i class="k-dot" /> {B} v {W}: {avg == null ? `not out in ${h.balls} balls` : <b class="num">{fx(avg)}</b>}
          </span>
          <span>
            <i class="k-band" /> plausible range {fx(r.low, 0)}–{r.high == null ? "no upper limit" : r.high > max ? `${fx(r.high, 0)}+` : fx(r.high, 0)}
          </span>
        </div>
      </div>
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

function ScoringShape({ h, base, bowlerShort }: { h: BatAgg; base: BatAgg; bowlerShort: string }) {
  const bar = (a: BatAgg) => {
    const other = a.balls - SHAPE.reduce((s, [k]) => s + a[k], 0);
    return [...SHAPE.map(([k, l]) => ({ k, l, v: a[k] })), { k: "other", l: "other", v: Math.max(0, other) }];
  };
  const rows: [string, BatAgg][] = [
    [`v ${bowlerShort}`, h],
    ["v all bowlers", base],
  ];
  return (
    <figure class="shape">
      <figcaption class="mini-h">
        Scoring shape
        <Info text="Each ball faced, by runs off the bat. 'Other' is 5s and run fours or sixes; leg byes and byes count as dots for the batter." />
      </figcaption>
      {rows.map(([label, a]) => (
        <div class="shape-row">
          <span class="shape-label">{label}</span>
          <div class="shape-bar" role="img" aria-label={`${label}: ${bar(a).map((s) => `${s.l} ${fpct(pct(s.v, a.balls))}`).join(", ")}`}>
            {bar(a)
              .filter((s) => s.v > 0)
              .map((s) => (
                <span class={`seg seg-${s.k}`} style={{ flexGrow: s.v }} title={`${s.l}: ${s.v} of ${a.balls} (${fpct(pct(s.v, a.balls))})`} />
              ))}
          </div>
        </div>
      ))}
      <div class="shape-legend">
        {SHAPE.map(([k, l]) => (
          <span>
            <i class={`seg-${k}`} />
            {l} <b class="num">{fpct(pct(h[k], h.balls))}</b>
            <span class="vs-base num">{fpct(pct(base[k], base.balls))}</span>
          </span>
        ))}
      </div>
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
      <figcaption class="mini-h">
        Every Test they've met
        <Info text="One column per Test: height is balls faced, the label is runs, red marks are dismissals. This match counts only up to the selected ball." />
      </figcaption>
      <div class="meet-cols">
        {ms.map((m) => (
          <div class={`meet ${m.current ? "is-current" : ""}`} title={`${m.venue}, ${m.date}: ${m.runs} off ${m.balls}, out ${m.outs}`}>
            <span class="meet-outs">
              {Array.from({ length: m.outs }).map(() => (
                <i />
              ))}
            </span>
            <span class="meet-bar" style={{ height: `${Math.max(2, (100 * m.balls) / maxBalls)}%` }} />
            <span class="meet-runs num">
              {m.runs}
              <small>/{m.balls}</small>
            </span>
            <span class="meet-label">{m.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function Splits({ bat, bowl }: { bat: string; bowl: string }) {
  const { bundle, rows, scopes, scope, setScope } = useMatch();
  const career = scopes.find((s) => s.id === "career")!;
  const lines: { key: string; label: string; a: BatAgg; scope?: Scope }[] = scopes.map((s) => ({ key: s.id, label: s.label, a: h2hAgg(bundle, rows, bat, bowl, s), scope: s }));
  const byInnings = [1, 2, 3, 4].map((i) => ({ key: `i${i}`, label: `${["1st", "2nd", "3rd", "4th"][i - 1]} innings of match`, a: h2hAgg(bundle, rows, bat, bowl, career, { innings: [i] }) }));
  return (
    <details class="splits" open>
      <summary class="mini-h">Every window</summary>
      <div class="scroll">
        <table class="table num">
          <thead>
            <tr>
              <th scope="col">Window</th>
              <th>Balls</th>
              <th>Runs</th>
              <th>Out</th>
              <th>Avg</th>
              <th>SR</th>
              <th>Dot %</th>
              <th>
                <span class="sr">Evidence</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map(({ key, label, a, scope: s }) => (
              <tr class={key === scope ? "is-selected" : ""} onClick={() => s && setScope(s.id)}>
                <th scope="row">
                  <button type="button" class="row-btn" onClick={() => s && setScope(s.id)}>
                    {label}
                  </button>
                </th>
                <Cells a={a} />
              </tr>
            ))}
            <tr class="group">
              <th colSpan={8}>Career, by match innings</th>
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
    </details>
  );
}

function Cells({ a }: { a: BatAgg }) {
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
      <td>{avg == null ? <span class="muted">n/o</span> : fx(avg)}</td>
      <td>{fx(strikeRate(a.runs, a.balls))}</td>
      <td>{fpct(pct(a.dots, a.balls))}</td>
      <td title={EVIDENCE_TEXT[evidence(a.balls, a.outs)]}>
        <EvidenceMeter outs={a.outs} />
      </td>
    </>
  );
}
