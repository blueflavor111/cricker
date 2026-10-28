import { useEffect, useRef, useState } from "preact/hooks";
import { useMatch } from "./context";
import { code, describeBall, names, teamColor } from "./format";
import { moments, oversText } from "../engine/replay";
import { useMemo } from "preact/hooks";

// The match as one horizontal strip: innings as segments, wickets as ticks,
// close of play as dividers. Drag, click or use the keyboard to move through
// it; everything else on the page follows the cursor.
export function TimeBar() {
  const { bundle, timeline, state, go } = useMatch();
  const n = timeline.balls.length;
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const pos = (g: number) => (100 * g) / Math.max(1, n - 1);

  const fromEvent = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return Math.round(f * (n - 1));
  };

  const wickets = timeline.balls.filter((b) => b.w?.some((w) => !w.k.startsWith("retired")));
  const overStart = (g: number, dir: -1 | 1): number => {
    const b = timeline.balls[g];
    if (dir < 0) {
      let k = g;
      while (k > 0 && timeline.balls[k - 1].o === b.o && timeline.balls[k - 1].inn === b.inn) k--;
      return k === g ? overStart(Math.max(0, g - 1), -1) : k;
    }
    let k = g;
    while (k < n - 1 && timeline.balls[k + 1].o === b.o && timeline.balls[k + 1].inn === b.inn) k++;
    return Math.min(n - 1, k + 1);
  };
  const prevWicket = () => [...wickets].reverse().find((w) => w.g < state.cursor)?.g ?? 0;
  const nextWicket = () => wickets.find((w) => w.g > state.cursor)?.g ?? n - 1;
  const inn = timeline.innings[state.current.n - 1];
  const marks = useMemo(() => moments(timeline, names(bundle).full), [timeline]);
  const milestones = marks.filter((m) => m.kind === "milestone");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea, [role=dialog]")) return;
      const c = state.cursor;
      let to: number | null = null;
      if (e.key === "ArrowRight") to = e.shiftKey ? overStart(c, 1) : c + 1;
      else if (e.key === "ArrowLeft") to = e.shiftKey ? overStart(c, -1) : c - 1;
      else if (e.key === "]") to = nextWicket();
      else if (e.key === "[") to = prevWicket();
      else if (e.key === "Home") to = 0;
      else if (e.key === "End") to = n - 1;
      else if (e.key === " " && t === document.body) {
        e.preventDefault();
        setPlaying((p) => !p);
        return;
      }
      if (to != null) {
        e.preventDefault();
        go(to);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.cursor, n]);

  useEffect(() => {
    if (!playing) return;
    if (state.cursor >= n - 1) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => go(state.cursor + 1), 450);
    return () => clearTimeout(id);
  }, [playing, state.cursor]);

  const hb = hover != null ? timeline.balls[hover] : null;

  return (
    <section class="timebar" aria-label="Match timeline">
      <div class="wrap tb-inner">
        <div class="tb-controls">
          <button type="button" onClick={() => go(inn.start === state.cursor && inn.n > 1 ? timeline.innings[inn.n - 2].start : inn.start)} title="Start of innings" aria-label="Start of innings">⇤</button>
          <button type="button" onClick={() => go(prevWicket())} title="Previous wicket  [" aria-label="Previous wicket">W‹</button>
          <button type="button" onClick={() => go(overStart(state.cursor, -1))} title="Previous over  Shift+←" aria-label="Previous over">«</button>
          <button type="button" onClick={() => go(state.cursor - 1)} title="Previous ball  ←" aria-label="Previous ball">‹</button>
          <button type="button" class="play" onClick={() => setPlaying(!playing)} aria-pressed={playing} title="Play  Space" aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <button type="button" onClick={() => go(state.cursor + 1)} title="Next ball  →" aria-label="Next ball">›</button>
          <button type="button" onClick={() => go(overStart(state.cursor, 1))} title="Next over  Shift+→" aria-label="Next over">»</button>
          <button type="button" onClick={() => go(nextWicket())} title="Next wicket  ]" aria-label="Next wicket">›W</button>
          <button type="button" onClick={() => go(n - 1)} title="End of match" aria-label="End of match">⇥</button>
        </div>
        <div class="tb-track-wrap">
          <div
            class="tb-track"
            ref={track}
            role="slider"
            tabIndex={0}
            aria-label="Delivery"
            aria-valuemin={0}
            aria-valuemax={n - 1}
            aria-valuenow={state.cursor}
            aria-valuetext={`Innings ${state.current.n}, over ${state.ball.label}, ${state.current.runs} for ${state.current.wickets}`}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              go(fromEvent(e));
            }}
            onPointerMove={(e) => {
              setHover(fromEvent(e));
              if (e.buttons === 1) go(fromEvent(e));
            }}
            onPointerLeave={() => setHover(null)}
          >
            {timeline.innings.map((i) => (
              <div
                class={`tb-seg ${i.n === state.current.n ? "is-current" : ""}`}
                style={{ left: `${pos(i.start)}%`, width: `${pos(i.end) - pos(i.start)}%`, "--team": teamColor(bundle, i.team) }}
              >
                <span class="tb-seg-label" hidden={pos(i.end) - pos(i.start) < 6}>
                  {code(i.team)} {timeline.innings.filter((x) => x.team === i.team && x.n <= i.n).length === 1 ? "1st" : "2nd"}
                </span>
              </div>
            ))}
            <div class="tb-fill" style={{ width: `${pos(state.cursor)}%` }} />
            {wickets.map((w) => (
              <span class={`tb-wkt ${w.g <= state.cursor ? "past" : ""}`} style={{ left: `${pos(w.g)}%` }} />
            ))}
            {milestones.map((m) => (
              <span class={`tb-mile ${m.g <= state.cursor ? "past" : ""}`} style={{ left: `${pos(m.g)}%` }} />
            ))}
            {timeline.days.slice(0, -1).map((d) => (
              <span class="tb-day" style={{ left: `${pos(d.end + 0.5)}%` }} title={`Close of play, day ${d.day}`} />
            ))}
            {timeline.days.map((d, k) => {
              const start = k ? timeline.days[k - 1].end + 1 : 0;
              return (
                <span class="tb-day-label" style={{ left: `${(pos(start) + pos(d.end)) / 2}%` }}>
                  D{d.day}
                </span>
              );
            })}
            <span class="tb-cursor" style={{ left: `${pos(state.cursor)}%` }} />
            {hb && (
              <span class="tb-tip" style={{ left: `${Math.min(88, Math.max(12, pos(hb.g)))}%` }}>
                <b>
                  {code(hb.inn ? timeline.innings[hb.inn - 1].team : "")} {hb.label}
                </b>{" "}
                {describeBall(bundle, hb)}
              </span>
            )}
          </div>
        </div>
        <div class="tb-pos num">
          <select
            class="moments"
            aria-label="Jump to a moment"
            value=""
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              if (v) go(Number(v));
            }}
          >
            <option value="">Moments…</option>
            {timeline.innings.map((i) => (
              <optgroup label={`${i.team}, innings ${i.n}`}>
                {marks
                  .filter((m) => m.g >= i.start && m.g <= i.end)
                  .map((m) => (
                    <option value={m.g}>
                      {timeline.balls[m.g].label} {m.kind === "wicket" ? "W " : m.kind === "milestone" ? "★ " : ""}
                      {m.text}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <b>
            {code(state.current.team)} {state.current.runs}/{state.current.wickets}
          </b>{" "}
          {oversText(state.current.legal)} ov
        </div>
      </div>
    </section>
  );
}
