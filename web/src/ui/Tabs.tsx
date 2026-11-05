import { useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

// Tabs that keep secondary views one click away instead of stacked on the
// page. Arrow keys move between tabs, as screen-reader users expect.
export function Tabs<K extends string>({ label, tabs, initial, small }: { label: string; tabs: { id: K; label: string; render: () => ComponentChildren }[]; initial?: K; small?: boolean }) {
  const [sel, setSel] = useState<K>(initial ?? tabs[0].id);
  const list = useRef<HTMLDivElement>(null);
  const active = tabs.find((t) => t.id === sel) ?? tabs[0];
  const move = (dir: number) => {
    const i = (tabs.indexOf(active) + dir + tabs.length) % tabs.length;
    setSel(tabs[i].id);
    (list.current?.children[i] as HTMLElement | undefined)?.focus();
  };
  return (
    <>
      <div class={small ? "tabs tabs-sm" : "tabs"} role="tablist" aria-label={label} ref={list}>
        {tabs.map((t) => (
          <button
            type="button"
            role="tab"
            aria-selected={t === active}
            tabIndex={t === active ? 0 : -1}
            onClick={() => setSel(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                e.stopPropagation();
                move(e.key === "ArrowRight" ? 1 : -1);
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={active.label}>
        {active.render()}
      </div>
    </>
  );
}

// A section that shows its heading and a one-line summary, and opens on demand.
export function Collapse({ title, summary, children, open: initial = false }: { title: string; summary?: ComponentChildren; children: ComponentChildren; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div class={`ctx-block collapse ${open ? "is-open" : ""}`}>
      <button type="button" class="collapse-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="ctx-h">{title}</span>
        <span class="collapse-act">{open ? "Hide" : "Show"}</span>
      </button>
      {summary && <p class="ctx-sub">{summary}</p>}
      <div class="collapse-body">{children}</div>
    </div>
  );
}
