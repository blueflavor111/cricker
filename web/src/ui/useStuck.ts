import { useEffect, useState } from "preact/hooks";

// True once the scoreboard has scrolled out of view, so the playback bar can
// carry a compact score.
export function useStuck(ready: boolean) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = document.getElementById("score");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [ready]);
  return stuck;
}
