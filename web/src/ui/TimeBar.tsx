import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useMatch } from "./context";
import { code, describeBall, names, teamColor } from "./format";
import { moments, oversText } from "../engine/replay";

// Playback: one play/pause, previous and next delivery, and the whole match
// as a track with innings, days, wickets and milestones marked on it. The
// track is the scrubber; everything on the page follows its cursor.
export function TimeBar({ stuck }: { stuck: boolean }) {
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
  const marks = useMemo(() => moments(timeline, names(bundle).short), [timeline]);
  const milestones = marks.filter((m) => m.kind === "milestone");
  const cur = state.current;

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
      else if (e.key === " " && (t === document.body || t.classList.contains("pb-track"))) {
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
  const innLabel = (i: (typeof timeline.innings)[number]) => `${code(i.team)} ${timeline.innings.filter((x) => x.team === i.team && x.n <= i.n).length === 1 ? "1st" : "2nd"}`;

  return (
    <section class={`playback ${stuck ? "is-stuck" : ""}`} aria-label="Playback">
      <div class="wrap pb-inner">
        <div class="pb-mini num" aria-hidden={!stuck} style={{ "--team": teamColor(bundle, cur.team) }}>
          <b>
            {code(cur.team)} {cur.runs}
            {cur.wickets < 10 ? `/${cur.wickets}` : ""}
          </b>{" "}
          <span>{oversText(cur.legal)} ov</span>
        </div>

        <div class="pb-controls">
          <button type="button" class="btn" onClick={() => go(state.cursor - 1)} disabled={state.cursor === 0} title="Previous delivery (←)">
            <span aria-hidden="true">‹</span> <span class="pb-txt">Previous</span>
            <span class="sr">Previous delivery</span>
          </button>
          <button type="button" class="btn btn-primary" onClick={() => setPlaying(!playing)} aria-pressed={playing} title="Play or pause (Space)">
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" class="btn" onClick={() => go(state.cursor + 1)} disabled={state.cursor >= n - 1} title="Next delivery (→)">
            <span class="pb-txt">Next</span> <span aria-hidden="true">›</span>
            <span class="sr">Next delivery</span>
          </button>
        </div>

        <div class="pb-track-wrap">
          <div
            class="pb-track"
            ref={track}
            role="slider"
            tabIndex={0}
            aria-label="Delivery"
            aria-valuemin={0}
            aria-valuemax={n - 1}
            aria-valuenow={state.cursor}
            aria-valuetext={`Innings ${cur.n}, over ${state.ball.label}, ${cur.runs} for ${cur.wickets}`}
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
            <div class="pb-lane pb-inns">
              {timeline.innings.map((i) => (
                <div
                  class={`pb-seg ${i.n === cur.n ? "is-current" : ""} ${i.start > state.cursor ? "is-future" : ""}`}
                  style={{ left: `${pos(i.start)}%`, width: `${pos(i.end) - pos(i.start)}%`, "--team": teamColor(bundle, i.team) }}
                >
                  <span class="pb-seg-label" hidden={pos(i.end) - pos(i.start) < 7}>
                    {innLabel(i)}
                  </span>
                </div>
              ))}
              <div class="pb-played" style={{ width: `${pos(state.cursor)}%` }} />
              {wickets.map((w) => (
                <span class={`pb-wkt ${w.g <= state.cursor ? "past" : ""}`} style={{ left: `${pos(w.g)}%` }} />
              ))}
            </div>
            <div class="pb-lane pb-marks" aria-hidden="true">
              {milestones.map((m) => (
                <span class="pb-mile" style={{ left: `${pos(m.g)}%` }} />
              ))}
            </div>
            <div class="pb-lane pb-days" aria-hidden="true">
              {timeline.days.map((d, k) => {
                const start = k ? timeline.days[k - 1].end + 1 : 0;
                return (
                  <span class={`pb-day ${state.day === d.day ? "is-now" : ""}`} style={{ left: `${pos(start)}%`, width: `${pos(d.end) - pos(start)}%` }}>
                    <span hidden={pos(d.end) - pos(start) < 3}>
                      <span class="pb-day-long">Day </span>
                      <span class="pb-day-short">D</span>
                      {d.day}
                    </span>
                  </span>
                );
              })}
            </div>
            <span class="pb-cursor" style={{ left: `${pos(state.cursor)}%` }} />
            {hb && (
              <span class="pb-tip" style={{ left: `${Math.min(85, Math.max(15, pos(hb.g)))}%` }}>
                <b class="num">
                  {code(hb.inn ? timeline.innings[hb.inn - 1].team : "")} {hb.label}
                </b>{" "}
                {describeBall(bundle, hb)}
              </span>
            )}
          </div>
          <p class="pb-legend">
            <span>
              <i class="k-wkt" /> wicket
            </span>
            <span>
              <i class="k-mile" /> 50, 100 or five wickets
            </span>
            <span class="pb-keys">Drag the track, or use ← → (Shift for overs), [ ] for wickets</span>
          </p>
        </div>

        <div class="pb-jump">
          <button type="button" class="btn btn-quiet" onClick={() => go(prevWicket())} title="Previous wicket ([)">
            ‹ Wicket
          </button>
          <button type="button" class="btn btn-quiet" onClick={() => go(nextWicket())} title="Next wicket (])">
            Wicket ›
          </button>
          <select
            class="select"
            aria-label="Jump to a moment"
            value=""
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              if (v) go(Number(v));
            }}
          >
            <option value="">Jump to…</option>
            {timeline.innings.map((i) => (
              <optgroup label={`${i.team}, ${innLabel(i).split(" ")[1]} innings`}>
                {marks
                  .filter((m) => m.g >= i.start && m.g <= i.end)
                  .map((m) => (
                    <option value={m.g}>
                      {timeline.balls[m.g].label} {m.kind === "wicket" ? "Wicket: " : ""}
                      {m.text}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
