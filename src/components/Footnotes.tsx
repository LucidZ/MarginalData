import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import "./Footnotes.css";

export interface FootnoteEntry {
  id: number;
  content: ReactNode;
}

const FootnotesContext = createContext<FootnoteEntry[]>([]);

// Wrap a story's content in this once, passing its notes array — every
// FootnoteRef/NotesList inside reads from context, so call sites don't need
// to pass the array around themselves.
export function FootnotesProvider({
  notes,
  children,
}: {
  notes: FootnoteEntry[];
  children: ReactNode;
}) {
  return <FootnotesContext.Provider value={notes}>{children}</FootnotesContext.Provider>;
}

// Click-to-toggle popover, not a jump-to-bottom anchor link: an <a
// href="#note-N"> yanks the whole page down to a Notes section and leaves
// the reader to scroll all the way back — jarring on any page long enough
// to matter. This shows the note text right next to the marker instead,
// with zero page movement.
//
// Click rather than hover so it behaves identically on touch and mouse (no
// hover on touchscreens), and stays open while reading instead of
// vanishing the moment the cursor drifts off it.
export function FootnoteRef({ n }: { n: number }) {
  const notes = useContext(FootnotesContext);
  const note = notes[n - 1];
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  // Popovers default to left-aligned under the marker (see .footnote-popover),
  // which is enough for most markers, but one near the right edge of the
  // text column would spill off the viewport — this nudges it back on
  // screen after measuring, rather than guessing a fixed position upfront.
  const [offsetX, setOffsetX] = useState(0);

  useEffect(() => {
    if (!open) return;
    setOffsetX(0);
    const raf = requestAnimationFrame(() => {
      const el = popoverRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 8;
      let shift = 0;
      if (rect.right > window.innerWidth - margin) shift -= rect.right - (window.innerWidth - margin);
      if (rect.left + shift < margin) shift += margin - (rect.left + shift);
      if (shift !== 0) setOffsetX(shift);
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!note) return null; // n out of range for the provided notes — fail quiet, not crash

  return (
    <span className="footnote-wrap" ref={wrapRef}>
      <sup>
        <button
          type="button"
          className="footnote-ref"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {n}
        </button>
      </sup>
      {open && (
        <span
          ref={popoverRef}
          className="footnote-popover"
          role="tooltip"
          style={{ transform: `translateX(${offsetX}px)` }}
        >
          {note.content}
        </span>
      )}
    </span>
  );
}

// The full, scannable reference list — same notes array as every
// FootnoteRef above it, via context, so the two can never drift out of sync.
export function NotesList({ heading = "Notes & sources" }: { heading?: string }) {
  const notes = useContext(FootnotesContext);
  if (notes.length === 0) return null;
  return (
    <div className="notes-section">
      <h3 className="notes-heading">{heading}</h3>
      <ol className="notes-list">
        {notes.map((note) => (
          <li key={note.id} id={`note-${note.id}`}>
            {note.content}
          </li>
        ))}
      </ol>
    </div>
  );
}
