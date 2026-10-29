import { useEffect, useMemo, useState, useCallback } from "preact/hooks";
import { useStuck } from "./ui/useStuck";
import type { Bundle } from "./engine/types";
import { SCHEMA } from "./engine/types";
import { buildTimeline, stateAt } from "./engine/replay";
import { currentRows, scopes, type ScopeId } from "./engine/stats";
import { Masthead, TopNav } from "./ui/Header";
import { TimeBar } from "./ui/TimeBar";
import { Contest } from "./ui/Contest";
import { Development } from "./ui/Development";
import { GroundContext } from "./ui/GroundContext";
import { Deep } from "./ui/Deep";
import { PlayerDrawer } from "./ui/PlayerDrawer";
import { Ctx } from "./ui/context";

export interface MatchIndexEntry {
  id: string;
  title: string;
  short: string;
  date: string;
}

// Everything that should survive a reload or a shared link lives in the hash.
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { m: p.get("m"), b: p.get("b"), p: p.get("p"), s: p.get("s") as ScopeId | null };
}

function writeHash(v: { m: string; b: number; p: string | null; s: ScopeId }) {
  const p = new URLSearchParams({ m: v.m, b: String(v.b), s: v.s });
  if (v.p) p.set("p", v.p);
  // Some embedded viewers refuse history changes; the page works without them.
  try {
    history.replaceState(null, "", `#${p}`);
  } catch {
    /* keep going */
  }
}

export function App() {
  const [index, setIndex] = useState<MatchIndexEntry[] | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initial = readHash();
  const [matchId, setMatchId] = useState<string | null>(initial.m);
  const [cursor, setCursor] = useState<number>(initial.b != null ? Number(initial.b) : -1);
  const [player, setPlayer] = useState<string | null>(initial.p);
  const [scope, setScope] = useState<ScopeId>(initial.s ?? "career");
  const stuck = useStuck(!!bundle);

  useEffect(() => {
    fetch("data/index.json")
      .then((r) => r.json())
      .then((ix: MatchIndexEntry[]) => {
        setIndex(ix);
        if (!matchId) setMatchId(ix.find((m) => m.id === "1426557")?.id ?? ix[0].id);
      })
      .catch(() => setError("Couldn't load the match list."));
  }, []);

  useEffect(() => {
    if (!matchId) return;
    setBundle(null);
    fetch(`data/${matchId}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((b: Bundle) => {
        if (b.schema !== SCHEMA) throw new Error(`schema ${b.schema}`);
        setBundle(b);
      })
      .catch((e) => setError(`Couldn't load match ${matchId} (${e.message}).`));
  }, [matchId]);

  const timeline = useMemo(() => (bundle ? buildTimeline(bundle) : null), [bundle]);
  const last = timeline ? timeline.balls.length - 1 : 0;
  const at = cursor < 0 || cursor > last ? last : cursor;
  const state = useMemo(() => (timeline ? stateAt(timeline, at) : null), [timeline, at]);
  const rows = useMemo(() => (timeline ? currentRows(timeline, at) : null), [timeline, at]);
  const scopeList = useMemo(() => (bundle ? scopes(bundle) : []), [bundle]);

  useEffect(() => {
    if (bundle) writeHash({ m: bundle.match.id, b: at, p: player, s: scope });
  }, [bundle, at, player, scope]);

  const go = useCallback((g: number) => setCursor(Math.max(0, Math.min(last, g))), [last]);
  const openMatch = (id: string) => {
    setMatchId(id);
    setCursor(-1);
    setPlayer(null);
  };

  if (error) return <div class="fatal">{error}</div>;
  if (!bundle || !timeline || !state || !rows) return <div class="loading" aria-busy="true">Loading match…</div>;

  const ctx = { bundle, timeline, state, rows, scope, scopes: scopeList, setScope, go, openPlayer: setPlayer };
  return (
    <Ctx.Provider value={ctx}>
      <TopNav index={index ?? []} onMatch={openMatch} />
      <Masthead />
      <TimeBar stuck={stuck} />
      <main class="wrap page">
        <div class="overview">
          <Contest />
          <GroundContext />
        </div>
        <Development />
        <Deep />
      </main>
      <footer class="foot wrap">
        <p>
          Ball-by-ball data from <a href={bundle.source.url}>Cricsheet</a> (data version {bundle.source.dataVersion}, revision{" "}
          {bundle.source.revision}, {bundle.source.created}), {bundle.source.licence}. Historical figures cover the men's Tests
          Cricsheet holds from Dec 2001; some older Tests are missing. No live feed is connected: this is a replay of a finished match.
        </p>
      </footer>
      {player && <PlayerDrawer id={player} onClose={() => setPlayer(null)} />}
    </Ctx.Provider>
  );
}
