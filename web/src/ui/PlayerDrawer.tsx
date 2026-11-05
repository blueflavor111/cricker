import { useEffect, useRef } from "preact/hooks";
import { useMatch } from "./context";
import { code, fx, fpct, names, teamColor } from "./format";
import { Name } from "./Name";
import { average, economy, pct, strikeRate, ballsPer } from "../engine/definitions";
import { batAgg, bowlAgg, shortVenue, type Scope } from "../engine/stats";
import type { BatRow } from "../engine/types";

// A player's record as it stood at the selected ball: history before this
// match plus this match so far.
export function PlayerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { bundle, rows, scopes, state } = useMatch();
  const n = names(bundle);
  const panel = useRef<HTMLDivElement>(null);
  const team = Object.entries(bundle.squads).find(([, ps]) => ps.includes(id))?.[0];
  const opp = team ? bundle.match.teams.find((t) => t !== team) : undefined;

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);

  const all: Scope[] = [...scopes];
  if (opp && team)
    all.splice(2, 0, { id: "career", label: `v ${opp}`, hint: "", current: true, prior: (h) => h.teams.includes(opp) && h.teams.includes(team) });
  const batting = all.map((s) => ({ s, a: batAgg(bundle, rows, id, s) }));
  const bowling = all.map((s) => ({ s, a: bowlAgg(bundle, rows, id, s) }));
  const bats = batting[0].a.innings > 0;
  const bowls = bowling[0].a.balls > 0;
  const recent = [...(bundle.history.batting[id] ?? []), ...(rows.batting.get(id) ?? [])].slice(-16);
  const by = bundle.history.dismissedBy[id] ?? [];
  const got = bundle.history.dismissed[id] ?? [];

  return (
    <div class="drawer-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-h" tabIndex={-1} ref={panel} style={{ "--team": team ? teamColor(bundle, team) : "var(--ink-3)" }}>
        <div class="drawer-head">
          <div>
            <span class="role">{team ? `${code(team)} · ` : ""}Test record</span>
            <h2 id="drawer-h">{n.full(id)}</h2>
            <span class="muted small">
              As it stood after {state.ball.label} in the {state.current.n > 2 ? "second" : "first"} {code(state.current.team)} innings
            </span>
          </div>
          <button type="button" class="close" onClick={onClose} aria-label="Close profile">
            ×
          </button>
        </div>

        {!bats && !bowls && <p class="empty">No Test deliveries for this player in the data before or during this match.</p>}

        {bats && (
          <>
            <h3 class="sub-h">Batting</h3>
            <div class="scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>Window</th>
                    <th>Inns</th>
                    <th>Runs</th>
                    <th>Avg</th>
                    <th>SR</th>
                    <th>Balls/4+6</th>
                  </tr>
                </thead>
                <tbody>
                  {batting.map(({ s, a }) => (
                    <tr>
                      <th scope="row">{s.label}</th>
                      {a.innings === 0 ? (
                        <td colSpan={5} class="none">
                          no innings
                        </td>
                      ) : (
                        <>
                          <td>{a.innings}</td>
                          <td>{a.runs}</td>
                          <td>{a.outs ? fx(average(a.runs, a.outs), 2) : <span class="muted">n/o</span>}</td>
                          <td>{fx(strikeRate(a.runs, a.balls))}</td>
                          <td>{fx(ballsPer(a.balls, a.fours + a.sixes))}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Recent rows={recent} />
            {by.length > 0 && (
              <p class="who">
                <span class="sub-h">Dismissed most by</span>{" "}
                {by.map(([p, k], i) => (
                  <>
                    {i ? ", " : ""}
                    <Name id={p} /> <span class="num muted">{k}</span>
                  </>
                ))}
                <span class="muted small"> (before this match)</span>
              </p>
            )}
          </>
        )}

        {bowls && (
          <>
            <h3 class="sub-h">Bowling</h3>
            <div class="scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>Window</th>
                    <th>Tests</th>
                    <th>Wkts</th>
                    <th>Avg</th>
                    <th>Econ</th>
                    <th>SR</th>
                    <th>Dot %</th>
                  </tr>
                </thead>
                <tbody>
                  {bowling.map(({ s, a }) => (
                    <tr>
                      <th scope="row">{s.label}</th>
                      {a.balls === 0 ? (
                        <td colSpan={6} class="none">
                          {s.id === "venue" ? "first Test here" : "did not bowl"}
                        </td>
                      ) : (
                        <>
                          <td>{a.matches}</td>
                          <td>{a.wickets}</td>
                          <td>{fx(a.wickets ? a.runs / a.wickets : null, 2)}</td>
                          <td>{fx(economy(a.runs, a.balls), 2)}</td>
                          <td>{fx(ballsPer(a.balls, a.wickets))}</td>
                          <td>{fpct(pct(a.dots, a.balls))}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {got.length > 0 && (
              <p class="who">
                <span class="sub-h">Dismissed most often</span>{" "}
                {got.map(([p, k], i) => (
                  <>
                    {i ? ", " : ""}
                    <Name id={p} /> <span class="num muted">{k}</span>
                  </>
                ))}
                <span class="muted small"> (before this match)</span>
              </p>
            )}
          </>
        )}
        <p class="muted small">
          Tests in Cricsheet's ball-by-ball record from Dec 2001; earlier careers are incomplete. Batting averages count every dismissal; bowling counts only
          bowler-credited ones. Byes and leg byes aren't charged to bowlers.
        </p>
      </div>
    </div>
  );
}

// Last innings as small columns: height is runs, a filled cap means out.
function Recent({ rows }: { rows: BatRow[] }) {
  const { bundle } = useMatch();
  if (!rows.length) return null;
  const max = Math.max(50, ...rows.map((r) => r[3]));
  return (
    <figure class="recent-inns">
      <figcaption class="sub-h">Last {rows.length} innings</figcaption>
      <div class="ri-cols">
        {rows.map((r) => {
          const m = bundle.history.matches[r[0]];
          const where = m ? `${shortVenue(m.venueName)}, ${m.date}` : "this match";
          return (
            <span class={`ri ${r[4] ? "out" : "notout"} ${m ? "" : "is-current"}`} title={`${r[3]}${r[4] ? "" : "*"} (${r[2]}) at ${where}`}>
              <i style={{ height: `${Math.max(3, (100 * r[3]) / max)}%` }} />
              <b class="num">
                {r[3]}
                {r[4] ? "" : "*"}
              </b>
            </span>
          );
        })}
      </div>
    </figure>
  );
}
