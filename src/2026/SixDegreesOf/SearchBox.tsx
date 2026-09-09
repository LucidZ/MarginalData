import { useEffect, useMemo, useRef, useState } from "react";
import type { Actor } from "./types";

interface Props {
  actors: Actor[];
  /** "loading": the full pool hasn't landed yet, so `actors` is still the
   * small bundled slice (see App.tsx) - a real actor outside it would
   * otherwise get misreported as "not in this pool" for the first ~2s of
   * every load. "error": the full pool failed and never will this session,
   * so the same caveat is permanent rather than temporary. "ready": `actors`
   * is the authoritative full pool. */
  status: "loading" | "error" | "ready";
  onSelect: (actor: Actor) => void;
}

const MAX_RESULTS = 8;
const LISTBOX_ID = "sdo-search-listbox";

export default function SearchBox({ actors, status, onSelect }: Props) {
  const [query, setQuery] = useState("");
  // -1 means nothing is highlighted yet - an arrow key is what gives the
  // list a selection, not typing itself (mirrors most combobox widgets, and
  // is what lets Enter-with-no-navigation be a safe no-op rather than
  // silently jumping to whatever sorted first).
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // `actors` arrives pre-sorted by co-star degree (see generate_six_degrees_data.py),
  // so among equally-good substring matches the more-connected actor surfaces first.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: Actor[] = [];
    for (const actor of actors) {
      if (actor.name.toLowerCase().includes(q)) {
        results.push(actor);
        if (results.length >= MAX_RESULTS) break;
      }
    }
    return results;
  }, [actors, query]);

  const isOpen = query.trim() !== "";

  // Closes the dropdown on an outside click without relying on the input's
  // own blur: a plain onBlur fires (and would close the dropdown, unmounting
  // its buttons) before a click on one of those buttons' onClick handler
  // gets a chance to run. pointerdown fires earlier than that teardown, and
  // clicking a result is itself inside containerRef, so it's naturally
  // excluded from "outside".
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setQuery("");
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  const select = (actor: Actor) => {
    onSelect(actor);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && matches[activeIndex]) {
        e.preventDefault();
        select(matches[activeIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
    }
  };

  const activeOption = activeIndex >= 0 ? matches[activeIndex] : undefined;

  // Loading and error both leave `actors` as the small bundled slice rather
  // than the full pool, so a flat "no actor by that name" would misreport a
  // perfectly real actor who just hasn't loaded yet - each state gets its
  // own message instead of falling through to the ready-state one.
  let statusMessage: string | null = null;
  if (matches.length === 0) {
    if (status === "loading") statusMessage = "Still loading the full list of actors…";
    else if (status === "error") {
      statusMessage = "Showing a small sample - search only covers the actors already on screen.";
    } else statusMessage = `No actor by that name in this pool of ${actors.length.toLocaleString()}.`;
  }

  return (
    <div className="sdo-search" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // Reset synchronously in the same handler, not a separate effect
          // keyed on `query` - an effect runs after paint, so for one frame
          // the old index could point at a stale (or now out-of-range) match
          // from before the keystroke.
          setActiveIndex(-1);
        }}
        onKeyDown={onKeyDown}
        placeholder="Type an actor's name..."
        className="sdo-search-input"
        aria-label="Search for an actor"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={LISTBOX_ID}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? `sdo-search-option-${activeOption.id}` : undefined}
      />
      {isOpen && (
        <ul className="sdo-search-results" id={LISTBOX_ID} role="listbox">
          {matches.map((actor, i) => (
            <li key={actor.id}>
              <button
                type="button"
                id={`sdo-search-option-${actor.id}`}
                role="option"
                aria-selected={i === activeIndex}
                className={i === activeIndex ? "sdo-search-option-active" : undefined}
                onClick={() => select(actor)}
              >
                {actor.name}
              </button>
            </li>
          ))}
          {statusMessage && (
            <li className="sdo-search-status" role="presentation">
              {statusMessage}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
