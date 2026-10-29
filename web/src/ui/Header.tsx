import type { MatchIndexEntry } from "../app";
import { oversText, type InningsState } from "../engine/replay";
import { useMatch } from "./context";
import { ballCode, describeBall, dismissalText, fx, names, ordinal, teamColor } from "./format";
import { Name } from "./Name";
import { shortVenue, fmtDate } from "../engine/stats";

export const scoreText = (i: InningsState) => `${i.runs}${i.wickets < 10 ? `/${i.wickets}` : ""}${i.declared ? "d" : ""}`;

export function resultText(o: { winner?: string; result?: string; by: { runs?: number; wickets?: number; innings?: number } }) {
  if (o.result === "draw") return "Match drawn";
  if (o.result === "tie") return "Match tied";
  if (!o.winner) return o.result ?? "No result";
  const margin = o.by.runs ? `${o.by.runs} runs` : o.by.wickets ? `${o.by.wickets} wickets` : "";
  return `${o.winner} won${o.by.innings ? " by an innings and" : margin ? " by" : ""} ${margin}`.trim();
}

// "Test 3: Brisbane 2024" -> ["3rd Test", "Brisbane"]
const navLabel = (short: string) => {
  const m = short.match(/^Test (\d+): (.+?) \d{4}$/);
  return m ? [`${ordinal(Number(m[1]))} Test`, m[2]] : [short, ""];
};

// Brand, the series' matches as navigation, nothing else.
export function TopNav({ index, onMatch }: { index: MatchIndexEntry[]; onMatch: (id: string) => void }) {
  const { bundle } = useMatch();
  const m = bundle.match;
  return (
    <nav class="topnav" aria-label="Matches">
      <div class="wrap topnav-inner">
        <span class="brand">Cricker</span>
        <span class="topnav-series">
          {m.series.name} {m.series.season}
        </span>
        {index.length > 1 && (
          <>
            <ol class="match-tabs">
              {index.map((x) => {
                const [t, place] = navLabel(x.short);
                return (
                  <li>
                    <a
                      href={`#m=${x.id}`}
                      aria-current={x.id === m.id ? "page" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        onMatch(x.id);
                      }}
                    >
                      {t} <span>{place}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
            <label class="match-select">
              <span class="sr">Match</span>
              <select value={m.id} onChange={(e) => onMatch((e.target as HTMLSelectElement).value)}>
                {index.map((x) => (
                  <option value={x.id}>{navLabel(x.short).join(", ")}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </nav>
  );
}

// The scoreboard: the score dominates, the state of play reads as one line
// beneath it, the whole match as a scorebook summary beside it.
export function Masthead() {
  const { bundle, state, timeline } = useMatch();
  const m = bundle.match;
  const cur = state.current;
  const n = names(bundle);
  const final = state.status === "final";

  let situation: string;
  if (final) situation = resultText(m.outcome);
  else if (cur.complete) situation = cur.declared ? `${cur.team} declared` : `${cur.team} all out`;
  else if (cur.n === 1) situation = `${cur.team} batting first`;
  else if (state.target != null) situation = state.target - cur.runs > 0 ? `${cur.team} need ${state.target - cur.runs} to win` : `${cur.team} have reached the target`;
  else if (state.lead < 0) situation = `${cur.team} trail by ${-state.lead}`;
  else if (state.lead > 0) situation = `${cur.team} lead by ${state.lead}`;
  else situation = "Scores level";

  const rr = cur.legal ? (6 * cur.runs) / cur.legal : null;
  const stand = cur.partnerships[cur.partnerships.length - 1];
  const bowler = cur.bowlers.find((b) => b.id === state.bowler);
  const lastOut = state.ball.w?.length ? cur.batters.find((b) => b.id === state.ball.w![0].out) : null;
  const pair = [state.ball.bat, state.ball.ns].map((id) => ({ id, b: cur.batters.find((x) => x.id === id)!, gone: !state.crease.includes(id) }));
  const thisOver = state.recent.filter((d) => d.o === state.ball.o && d.inn === state.ball.inn);
  const venue = shortVenue(m.venue.name).replace(/^the /, "The ");

  return (
    <header class="masthead" id="masthead">
      <div class="wrap">
        <p class="mh-meta">
          <span>{m.series.number ? `${ordinal(m.series.number)} Test` : "Test"}</span>
          <span>
            {m.teams[0]} v {m.teams[1]}
          </span>
          <span>
            {venue}
            {m.venue.city && venue !== m.venue.city ? `, ${m.venue.city}` : ""}
          </span>
          <span>{fmtDate(m.dates[0])}</span>
          {state.day != null && (
            <span>
              Day {state.day} of {timeline.days.length || m.dates.length}
            </span>
          )}
          <span class={`status status-${state.status}`}>{final ? "Final" : "Replay"}</span>
        </p>

        <div class="mh-grid">
          <div class="mh-score" style={{ "--team": teamColor(bundle, cur.team) }}>
            <div class="mh-line1">
              <span class="mh-team">{cur.team}</span>
              <span class="mh-runs num" id="score">
                {cur.runs}
                {cur.wickets < 10 && <span class="mh-wk">/{cur.wickets}</span>}
                {cur.declared && <span class="mh-wk">d</span>}
              </span>
              <span class="mh-overs num">{oversText(cur.legal)} overs</span>
            </div>
            <p class="mh-situation">
              <b>{situation}</b>
              <span class="num">
                {ordinal(cur.n)} innings · run rate {fx(rr, 2)}
                {stand && !cur.complete && ` · stand ${stand.runs} (${stand.balls})`}
              </span>
            </p>
            <p class="mh-crease num">
              {state.crease.length === 0 && cur.complete ? (
                <span class="muted">{cur.declared ? "Innings declared" : "Innings complete"}</span>
              ) : (
                <>
                  {pair.map(({ id, b, gone }) => (
                    <span class={`mh-p ${id === state.striker ? "on-strike" : ""} ${gone ? "gone" : ""}`}>
                      <Name id={id} short /> {b.runs}
                      {gone ? "" : "*"} ({b.balls}){gone && <span class="mh-out"> out</span>}
                      {id === state.striker && <span class="sr"> on strike</span>}
                    </span>
                  ))}
                  {bowler && (
                    <span class="mh-p bowler">
                      <Name id={bowler.id} short /> {bowler.wickets}–{bowler.runs} ({oversText(bowler.balls)})
                    </span>
                  )}
                </>
              )}
            </p>
            <div class={`mh-last ${state.ball.w?.length ? "is-wicket" : ""}`} aria-live="polite">
              <span class="mh-last-ball">
                <span class="num">{state.ball.label}</span>{" "}
                {lastOut ? (
                  <>
                    {n.short(state.ball.bowl)} to {n.short(state.ball.bat)}, <b>out</b>: {n.short(lastOut.id)} {dismissalText(bundle, lastOut.out)} {lastOut.runs} ({lastOut.balls})
                  </>
                ) : (
                  describeBall(bundle, state.ball)
                )}
              </span>
              <span class="mh-over" aria-label="This over">
                <span class="mh-over-k">This over</span>
                {thisOver.map((d) => {
                  const c = ballCode(d);
                  return (
                    <span class={`bc bc-${c.kind} ${d.g === state.cursor ? "is-now" : ""}`} title={`${d.label} ${describeBall(bundle, d)}`}>
                      {c.text}
                    </span>
                  );
                })}
              </span>
            </div>
          </div>

          <table class="mh-book num" aria-label="Match summary">
            <thead>
              <tr>
                <th scope="col">
                  <span class="sr">Team</span>
                </th>
                <th scope="col">1st inns</th>
                <th scope="col">2nd inns</th>
              </tr>
            </thead>
            <tbody>
              {m.teams.map((t) => {
                const inns = state.innings.filter((i) => i.team === t);
                return (
                  <tr style={{ "--team": teamColor(bundle, t) }}>
                    <th scope="row">
                      <i class="sw" />
                      {t}
                    </th>
                    {[0, 1].map((k) => {
                      const i = inns[k];
                      if (!i) return <td class="none">{k === 0 ? "yet to bat" : ""}</td>;
                      return (
                        <td class={i === cur ? "is-now" : ""}>
                          {scoreText(i)}
                          <small> {oversText(i.legal)} ov</small>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            {m.toss.winner && (
              <caption>
                Toss: {m.toss.winner}, chose to {m.toss.decision}
              </caption>
            )}
          </table>
        </div>
      </div>
    </header>
  );
}
