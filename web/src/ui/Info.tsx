import { useState } from "preact/hooks";

// A definition on demand: hover, focus or tap the (i).
export function Info({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span class="info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" class="info-btn" aria-label="What this means" aria-expanded={open} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)}>
        i
      </button>
      {open && (
        <span class="info-pop" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
