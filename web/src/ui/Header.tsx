import type { MatchIndexEntry } from "../app";
import { oversText, type InningsState } from "../engine/replay";
import { strikeRate } from "../engine/definitions";
import { useMatch } from "./context";
import { ballCode, code, describeBall, dismissalText, fx, names, ordinal, teamColor } from "./format";
import { Name } from "./Name";
import { shortVenue, fmtDate } from "../engine/stats";

const scoreText = (i: InningsState) => `${i.runs}${i.wickets < 10 ? `/${i.wickets}` : ""}${i.declared ? "d" : ""}`;

export function resultText(o: { winner?: string; result?: string; by: { runs?: number; wickets?: number; innings?: number } }) {
  if (o.result === "draw") return "Match drawn";
  if (o.result === "tie") return "Match tied";
  if (!o.winner) return o.result ?? "No result";
  const margin = o.by.runs ? `${o.by.runs} runs` : o.by.wickets ? `${o.by.wickets} wickets` : "";
  return `${o.winner} won${o.by.innings ? " by an innings and" : margin ? " by" : ""} ${margin}`.trim();
}

export function Header({ index, onMatch }: { index: MatchIndexEntry[]; onMatch: (id: string) => void }) {
  const { bundle, state, timeline } = useMatch();
  const m = bundle.match;
  const cur = state.current;
  const other = m.teams.find((t) => t !== cur.team)!;
  const dayCount = timeline.days.length;

  let situation: string;
  if (state.status === "final") situation = resultText(m.outcome);
  else if (cur.n === 1) situation = `${cur.team} batting first`;
  else if (state.target != null) situation = state.target - cur.runs > 0 ? `${code(cur.team)} need ${state.target - cur.runs} to win` : `${cur.team} have reached the target`;
  else if (state.lead < 0) situation = `${cur.team} trail by ${-state.lead}`;
  else if (state.lead > 0) situation = `${cur.team} lead by ${state.lead}`;
  else situation = "Scores level";

  const rr = cur.legal ? (6 * cur.runs) / cur.legal : null;
  const stand = cur.partnerships[cur.partnerships.length - 1];
  const bowler = cur.bowlers.find((b) => b.id === state.bowler);
  const lastOut = state.ball.w?.length ? cur.batters.find((b) => b.id === state.ball.w![0].out) : null;

  return (
    <header class="top">
      <div class="top-meta wrap">
        <span class="brand">Cricker</span>
        <span class={`status status-${state.status}`} title={state.status === "final" ? "The match is over; this is its final state" : "A past moment in a finished match. Everything shown is what was known after this ball."}>
          {state.status === "final" ? "Final" : "Replay"}
        </span>
        <span class="meta-text">
          {m.series.number ? `${ordinal(m.series.number)} Test` : "Test"}, {m.series.name} {m.series.season} · {shortVenue(m.venue.name).replace(/^the /, "The ")}, {m.venue.city ?? ""} ·{" "}
          {fmtDate(m.dates[0])}
          {state.day != null && <> · <b>Day {state.day}</b>{dayCount ? ` of ${dayCount}` : ""}</>}
        </span>
        {index.length > 1 && (
          <label class="switch">
            <span class="sr">Match</span>
            <select value={m.id} onChange={(e) => onMatch((e.target as HTMLSelectElement).value)}>
              {index.map((x) => (
                <option value={x.id}>{x.short}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div class="board wrap">
        <div class="teams" role="group" aria-label="Score">
          {m.teams.map((t) => {
            const inns = state.innings.filter((i) => i.team === t);
            const batting = t === cur.team && !(state.status === "final");
            return (
              <div class={`team-row ${t === cur.team ? "is-batting" : ""}`} style={{ "--team": teamColor(bundle, t) }}>
                <span class="team-code">{code(t)}</span>
                <span class="team-inns">
                  {inns.length === 0 && <span class="yet">Yet to bat</span>}
                  {inns.map((i, k) => (
                    <span class={i === cur && batting ? "inn-now" : "inn-done"}>
                      {k > 0 && <span class="amp">&amp;</span>}
                      <span class="num">{scoreText(i)}</span>
                    </span>
                  ))}
                </span>
                {t === cur.team && <span class="ov num">{oversText(cur.legal)} ov</span>}
              </div>
            );
          })}
        </div>

        <div class="situation">
          <div class="sit-line">{situation}</div>
          <div class="sit-sub num">
            {ordinal(cur.n)} innings · RR {fx(rr, 2)}
            {stand && !cur.complete && <> · Stand {stand.runs} ({stand.balls})</>}
          </div>
          <div class={`last-ball ${state.ball.w?.length ? "is-wicket" : ""}`} aria-live="polite">
            <span class="num lbl">{state.ball.label}</span>{" "}
            {lastOut ? (
              <>
                {names(bundle).short(state.ball.bowl)} to {names(bundle).short(state.ball.bat)}: OUT{" "}
                <span class="how">
                  {names(bundle).short(lastOut.id)} {dismissalText(bundle, lastOut.out)} {lastOut.runs} ({lastOut.balls})
                </span>
              </>
            ) : (
              describeBall(bundle, state.ball)
            )}
          </div>
        </div>

        <div class="crease">
          {!state.crease.length && cur.complete ? (
            <div class="crease-done">{cur.declared ? `${cur.team} declared` : `${cur.team} all out`}{state.status !== "final" && `, ${other} to bat`}</div>
          ) : (
            <>
              {[state.ball.bat, state.ball.ns].map((id) => {
                const b = cur.batters.find((x) => x.id === id)!;
                const gone = !state.crease.includes(id);
                return (
                  <div class={`crease-row ${id === state.striker ? "on-strike" : ""} ${gone ? "gone" : ""}`}>
                    <span class="mark" aria-hidden="true" />
                    <Name id={id} short />
                    <span class="num fig">
                      {b.runs}
                      {gone ? "" : "*"}
                    </span>
                    <span class="num sub">({b.balls})</span>
                    <span class="num sub sr">{gone ? "out" : `SR ${fx(strikeRate(b.runs, b.balls), 0)}`}</span>
                  </div>
                );
              })}
              {bowler && (
                <div class="crease-row bowler">
                  <span class="mark" aria-hidden="true" />
                  <Name id={bowler.id} short />
                  <span class="num fig">
                    {bowler.wickets}–{bowler.runs}
                  </span>
                  <span class="num sub">({oversText(bowler.balls)})</span>
                  <span class="num sub sr">{bowler.maidens} md</span>
                </div>
              )}
            </>
          )}
        </div>

        <ol class="recent" aria-label="Recent deliveries">
          {state.recent.map((d, k) => {
            const c = ballCode(d);
            const newOver = k > 0 && d.o !== state.recent[k - 1].o;
            return (
              <li class={`chip chip-${c.kind} ${newOver ? "new-over" : ""} ${d.g === state.cursor ? "is-now" : ""}`} title={`${d.label} ${describeBall(bundle, d)}`}>
                {c.text}
              </li>
            );
          })}
        </ol>
      </div>
    </header>
  );
}
