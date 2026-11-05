import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Bundle } from "../engine/types";
import type { MatchState, Timeline } from "../engine/replay";
import type { CurrentRows, Scope, ScopeId } from "../engine/stats";

export interface MatchCtx {
  bundle: Bundle;
  timeline: Timeline;
  state: MatchState;
  rows: CurrentRows;
  scope: ScopeId;
  scopes: Scope[];
  setScope: (s: ScopeId) => void;
  go: (g: number) => void;
  openPlayer: (id: string) => void;
}

export const Ctx = createContext<MatchCtx>(null as unknown as MatchCtx);
export const useMatch = () => useContext(Ctx);
