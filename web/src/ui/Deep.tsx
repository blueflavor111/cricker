import { useState } from "preact/hooks";
import { useMatch } from "./context";
import { ballCode, code, describeBall, dismissalText, fx, fpct, names, teamColor } from "./format";
import { Name } from "./Name";
import { economy, pct, strikeRate } from "../engine/definitions";
import { oversText } from "../engine/replay";
import { h2hAgg } from "../engine/stats";
import { Cells } from "./Contest";

type Tab = "card" | "attack" | "balls" | "defs";

export function Deep() {
  const [tab, setTab] = useState<Tab>("card");
  return (
    <section class="detail" aria-labelledby="detail-h">
      <header class="sec-head">
        <h2 id="detail-h">Detail</h2>
      </header>
      <div class="tabs" role="tablist" aria-label="Detail">
        {(
          [
            ["card", "Scorecard"],
            ["attack", "Matchups"],
            ["balls", "Ball by ball"],
            ["defs", "Definitions"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === "card" && <Scorecard />}
      {tab === "attack" && <Attack />}
      {tab === "balls" && <BallLog />}
      {tab === "defs" && <Definitions />}
    </section>
  );
}

function Scorecard() {
  const { bundle, state, go } = useMatch();
  const [pick, setPick] = useState<number | null>(null);
  const inn = state.innings[(pick ?? state.current.n) - 1] ?? state.current;
  const n = names(bundle);
  const squad = bundle.squads[inn.team] ?? [];
  const yet = squad.filter((p) => !inn.batters.some((b) => b.id === p));
  const ex = inn.extras;
  return (
    <div class="card">
      <div class="inn-tabs" role="tablist" aria-label="Innings">
        {state.innings.map((i) => (
          <button role="tab" aria-selected={i === inn} onClick={() => setPick(i.n)} style={{ "--team": teamColor(bundle, i.team) }}>
            <i class="sw" />
            {code(i.team)} {i.runs}
            {i.wickets < 10 ? `/${i.wickets}` : ""}
            {i.declared ? "d" : ""}
          </button>
        ))}
      </div>
      <div class="card-grid">
      <div>
      <div class="scroll">
        <table class="table card-bat">
          <thead>
            <tr>
              <th>Batter</th>
              <th class="dis-h"></th>
              <th>R</th>
              <th>B</th>
              <th>4s</th>
              <th>6s</th>
              <th>SR</th>
            </tr>
          </thead>
          <tbody>
            {inn.batters.map((b) => {
              const atCrease = inn === state.current && state.crease.includes(b.id);
              return (
                <tr class={atCrease ? "is-live" : ""}>
                  <th scope="row">
                    <Name id={b.id} />
                  </th>
                  <td class="dis">
                    {b.out ? (
                      <button type="button" class="link" onClick={() => go(b.out!.at)} title="Jump to the dismissal">
                        {dismissalText(bundle, b.out)}
                      </button>
                    ) : b.retired ? (
                      b.retired
                    ) : (
                      "not out"
                    )}
                  </td>
                  <td>
                    <b>{b.runs}</b>
                  </td>
                  <td>{b.balls}</td>
                  <td>{b.fours}</td>
                  <td>{b.sixes}</td>
                  <td>{fx(strikeRate(b.runs, b.balls))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p class="card-foot">
        Extras <b class="num">{ex.wd + ex.nb + ex.b + ex.lb + ex.pen}</b> (b {ex.b}, lb {ex.lb}, w {ex.wd}, nb {ex.nb}
        {ex.pen ? `, pen ${ex.pen}` : ""}) · Total{" "}
        <b class="num">
          {inn.runs}/{inn.wickets}
        </b>{" "}
        ({oversText(inn.legal)} ov)
        {yet.length > 0 && !inn.complete && (
          <>
            <br />
            Yet to bat: {yet.map((p, k) => <>{k ? ", " : ""}<Name id={p} short /></>)}
          </>
        )}
      </p>
      </div>
      <div>
      {inn.fow.length > 0 && (
        <p class="card-foot">
          Fall of wickets:{" "}
          {inn.fow.map((f, k) => (
            <>
              {k ? ", " : ""}
              <button type="button" class="link num" onClick={() => go(f.g)}>
                {f.wicket}-{f.runs}
              </button>{" "}
              <span class="muted">
                ({n.short(f.out)}, {f.label})
              </span>
            </>
          ))}
        </p>
      )}
      <div class="scroll">
        <table class="table card-bowl">
          <thead>
            <tr>
              <th>Bowler</th>
              <th>O</th>
              <th>M</th>
              <th>R</th>
              <th>W</th>
              <th>Econ</th>
              <th>Dot %</th>
              <th>Wd</th>
              <th>Nb</th>
            </tr>
          </thead>
          <tbody>
            {inn.bowlers.map((w) => (
              <tr class={inn === state.current && w.id === state.bowler ? "is-live" : ""}>
                <th scope="row">
                  <Name id={w.id} />
                </th>
                <td>{oversText(w.balls)}</td>
                <td>{w.maidens}</td>
                <td>{w.runs}</td>
                <td>
                  <b>{w.wickets}</b>
                </td>
                <td>{fx(economy(w.runs, w.balls), 2)}</td>
                <td>{fpct(pct(w.dots, w.balls))}</td>
                <td>{w.wides}</td>
                <td>{w.noballs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      </div>
    </div>
  );
}

// Each batter at the crease against every bowler in the opposition XI:
// who has the record to bowl at him?
function Attack() {
  const { bundle, state, rows, scopes, scope: scopeId } = useMatch();
  const scope = scopes.find((s) => s.id === scopeId)!;
  const cur = state.current;
  const batters = state.crease.length ? state.crease : [state.ball.bat];
  const opp = bundle.match.teams.find((t) => t !== cur.team)!;
  const bowlers = bundle.squads[opp];
  return (
    <div class="attack">
      <p class="muted small">
        Each batter at the crease against every bowler in the opposition, in the window chosen in the contest ({scope.label.toLowerCase()}). Sorted by balls faced.
      </p>
      {batters.map((bat) => {
        const list = bowlers
          .map((bw) => ({ bw, a: h2hAgg(bundle, rows, bat, bw, scope) }))
          .sort((x, y) => y.a.balls - x.a.balls);
        return (
          <div class="scroll">
            <table class="table">
              <caption>
                <Name id={bat} /> against {opp}
              </caption>
              <thead>
                <tr>
                  <th>Bowler</th>
                  <th>Balls</th>
                  <th>Runs</th>
                  <th>Out</th>
                  <th>Avg</th>
                  <th>SR</th>
                  <th>Dot %</th>
                  <th>Bdry %</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ bw, a }) => (
                  <tr class={bw === state.bowler ? "is-live" : ""}>
                    <th scope="row">
                      <Name id={bw} />
                    </th>
                    <Cells a={a} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function BallLog() {
  const { bundle, state, timeline, go } = useMatch();
  const cur = state.current;
  const inn = timeline.innings[cur.n - 1];
  const balls = timeline.balls.slice(inn.start, state.cursor + 1);
  const overs: { o: number; balls: typeof balls }[] = [];
  for (const b of balls) {
    if (!overs.length || overs[overs.length - 1].o !== b.o) overs.push({ o: b.o, balls: [] });
    overs[overs.length - 1].balls.push(b);
  }
  const shown = overs.reverse().slice(0, 30);
  return (
    <div class="ball-log">
      <p class="muted small">
        {code(cur.team)} {cur.n > 2 ? "second" : "first"} innings, latest over first. Select a ball to jump to it.
      </p>
      <ol>
        {shown.map(({ o, balls: bs }) => {
          const ov = cur.overs.find((x) => x.over === o);
          return (
            <li>
              <span class="ov-no num">{o + 1}</span>
              <span class="ov-bowler">
                <Name id={bs[0].bowl} short />
              </span>
              <span class="ov-balls">
                {bs.map((d) => {
                  const c = ballCode(d);
                  return (
                    <button type="button" class={`chip chip-${c.kind} ${d.g === state.cursor ? "is-now" : ""}`} onClick={() => go(d.g)} title={`${d.label} ${describeBall(bundle, d)}`}>
                      {c.text}
                    </button>
                  );
                })}
              </span>
              <span class="ov-sum num">
                {ov?.runs ?? 0} <small>· {ov?.cum ?? 0}</small>
              </span>
            </li>
          );
        })}
      </ol>
      {overs.length > 30 && <p class="muted small">Showing the last 30 of {overs.length} overs. Move the timeline to see earlier ones.</p>}
    </div>
  );
}

function Definitions() {
  const defs: [string, string][] = [
    ["Ball faced", "Every delivery except a wide. No-balls count as balls faced."],
    ["Dot ball", "A ball faced with no run off the bat, including the ball the batter was out to. Byes and leg byes count as dots for the batter."],
    ["Dismissal (head-to-head)", "Bowled, caught, lbw, stumped or hit wicket off this bowler. Run outs are not charged to the bowler."],
    ["Average", "Runs off the bat per dismissal. With no dismissals there is no average, which is not the same as zero."],
    ["Strike rate", "Runs off the bat per 100 balls faced."],
    ["Boundary %", "Share of balls faced hit for four or six. Fours and sixes that were run are left out."],
    ["90% range", "An exact Poisson interval on the number of dismissals: the band of underlying averages consistent with the record if dismissals arrive at a steady rate per ball."],
    ["Runs conceded", "Runs off the bat plus wides and no-balls. Byes and leg byes are not charged to the bowler."],
    ["Bowling average", "Runs conceded per bowler-credited wicket."],
    ["Retired", "Retired hurt and retired not out are not dismissals."],
    ["Windows", "Career is every Test in the data, including this match up to the selected ball. Before this match stops at its first day. Other windows filter the same rows by series, date, country or ground."],
    ["Coverage", "Men's Tests in Cricsheet's ball-by-ball record from Dec 2001. Some Tests are missing, so counts are of the data, not of all Tests ever played."],
  ];
  return (
    <dl class="defs">
      {defs.map(([k, v]) => (
        <div>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
