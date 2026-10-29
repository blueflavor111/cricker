import { useMatch } from "./context";
import { names } from "./format";

// Every player name opens their profile.
export function Name({ id, short, class: cls }: { id: string; short?: boolean; class?: string }) {
  const { bundle, openPlayer } = useMatch();
  const n = names(bundle);
  if (id === "sub") return <span>sub</span>;
  return (
    <button type="button" class={`name ${cls ?? ""}`} onClick={() => openPlayer(id)} title={`${n.full(id)}: open profile`}>
      {short ? n.short(id) : n.full(id)}
    </button>
  );
}
