import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
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

// Shared open/close + placement logic for the two inline popovers below
// (FootnoteRef and Gloss). Popovers render in the text flow, anchored under
// their trigger, and after opening get nudged back on screen: shifted
// horizontally if they'd spill off either edge, and flipped above the
// trigger if there's no room below (a term near the bottom of a phone
// screen would otherwise open off-screen).
//
// Dismissal: tap/click outside, Escape, or - for anything opened by touch -
// scrolling the page, since in a scrollyteller the text slides up under a
// sticky chart and a popover left open would ride over it.
function useInlinePopover() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [above, setAbove] = useState(false);

  useEffect(() => {
    // Reset on close, not on open: resetting on open races the measurement
    // below, which can then see the previous open's placement.
    if (!open) {
      setOffsetX(0);
      setAbove(false);
      return;
    }
    const raf = requestAnimationFrame(() => {
      const el = popoverRef.current;
      const wrap = wrapRef.current;
      if (!el || !wrap) return;
      const rect = el.getBoundingClientRect();
      const margin = 8;
      let shift = 0;
      if (rect.right > window.innerWidth - margin) shift -= rect.right - (window.innerWidth - margin);
      if (rect.left + shift < margin) shift += margin - (rect.left + shift);
      if (shift !== 0) setOffsetX(shift);
      const roomAbove = wrap.getBoundingClientRect().top;
      if (rect.bottom > window.innerHeight - margin && roomAbove > rect.height + margin) setAbove(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const scrollStart = window.scrollY;
    function handleOutside(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleScroll() {
      if (Math.abs(window.scrollY - scrollStart) > 60) setOpen(false);
    }
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [open]);

  const popoverClass = `footnote-popover${above ? " footnote-popover--above" : ""}`;
  const popoverStyle = { transform: `translateX(${offsetX}px)` };
  return { open, setOpen, wrapRef, popoverRef, popoverClass, popoverStyle };
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
  const { open, setOpen, wrapRef, popoverRef, popoverClass, popoverStyle } = useInlinePopover();

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
        <span ref={popoverRef} className={popoverClass} role="tooltip" style={popoverStyle}>
          {note.content}
        </span>
      )}
    </span>
  );
}

// A word in running text that hides a detail behind it — "eligible" opening
// the list of who's excluded, say. Styled like a link (dotted, to read as
// "definition" rather than "navigates away") so the sentence stays short and
// the caveat is one tap away instead of gone. Unlike FootnoteRef it carries
// its own content rather than an index into a numbered list, since these are
// asides, not citations, and don't belong in NotesList.
//
// Mouse users get hover-to-peek (with a short grace period so the cursor can
// travel into the popover to click a link inside it), and clicking pins it
// open. Touch and keyboard get plain tap/Enter to toggle.
export function Gloss({ children, note }: { children: ReactNode; note: ReactNode }) {
  const { open, setOpen, wrapRef, popoverRef, popoverClass, popoverStyle } = useInlinePopover();
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) setPinned(false);
  }, [open]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function onPointerEnter(e: ReactPointerEvent) {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function onPointerLeave(e: ReactPointerEvent) {
    if (e.pointerType !== "mouse" || pinned) return;
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  }
  function onClick() {
    // A hover already opened it: the click means "keep this open", not "close".
    if (open && !pinned) {
      setPinned(true);
      return;
    }
    setPinned(!open);
    setOpen(!open);
  }

  return (
    <span className="footnote-wrap" ref={wrapRef} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <button type="button" className="gloss-term" aria-expanded={open} onClick={onClick}>
        {children}
      </button>
      {open && (
        <span ref={popoverRef} className={popoverClass} role="tooltip" style={popoverStyle}>
          {note}
        </span>
      )}
    </span>
  );
}

// Bulleted list for use inside a Gloss or FootnoteRef note. Built from spans
// because the popover sits inside a <p>, where a real <ul> isn't allowed.
export function GlossList({ items }: { items: ReactNode[] }) {
  return (
    <span className="gloss-list">
      {items.map((item, i) => (
        <span className="gloss-list-item" key={i}>
          {item}
        </span>
      ))}
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
