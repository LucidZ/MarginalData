import { useEffect, useMemo, useRef, useState } from "react";
import { photoUrl } from "./graph";
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
const LISTBOX_ID = "tus-search-listbox";

/** Case- and diacritic-insensitive - "penelope" needs to find "Penélope
 * Cruz" without anyone having to type an accent they can't see is there.
 * NFD splits each accented character into a base letter + a separate
 * combining-mark codepoint, which the Diacritic regex then strips - "é"
 * becomes "e" plus a mark, and the mark is dropped. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Separator-free version of an already-normalized string - "de niro"
 * becomes "deniro". Used as a fallback match: someone typing "deniro" has
 * one token with no space in it, so the token-matching below (which splits
 * the *query* on whitespace) can't help - the missing space is inside the
 * name, not the query. Comparing collapsed-to-collapsed catches that
 * without needing to guess where a real name's internal spaces belong. */
function collapse(normalized: string): string {
  return normalized.replace(/[\s.'-]/g, "");
}

export default function SearchBox({ actors, status, onSelect }: Props) {
  const [query, setQuery] = useState("");
  // -1 means nothing is highlighted yet - an arrow key is what gives the
  // list a selection, not typing itself (mirrors most combobox widgets, and
  // is what lets Enter-with-no-navigation be a safe no-op rather than
  // silently jumping to whatever sorted first).
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalized once per `actors` update (a couple thousand rows, whenever
  // the bundled slice swaps for the full pool), not per keystroke.
  const normalizedActors = useMemo(
    () =>
      actors.map((actor) => {
        const normalizedName = normalize(actor.name);
        return { actor, normalizedName, collapsedName: collapse(normalizedName) };
      }),
    [actors],
  );

  // `actors` (and so `normalizedActors`) arrives pre-sorted by co-star
  // degree (see generate_usual_suspects_data.py), so among equally-ranked
  // matches the more-connected actor surfaces first - preserved here as the
  // tiebreak within each of the two tiers below, not just for a flat list.
  const matches = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    // Every space-separated token has to show up *somewhere* in the name,
    // not as one contiguous run - "samuel jackson" only used to match a
    // name containing that exact substring, which "Samuel L. Jackson"
    // isn't. Order between tokens doesn't matter, matching how people
    // actually recall names ("jackson samuel" should work too).
    const tokens = q.split(/\s+/).filter(Boolean);
    const collapsedQuery = collapse(q);
    const prefixMatches: Actor[] = [];
    const otherMatches: Actor[] = [];
    for (const { actor, normalizedName, collapsedName } of normalizedActors) {
      // Two independent ways to match, OR'd together: token-wise (handles
      // "samuel jackson" against "Samuel L. Jackson" - extra words in the
      // name are fine) and collapsed (handles "deniro" against "De Niro" -
      // the query itself has no space to split on, so token-matching alone
      // can't bridge a space that only exists inside the name).
      const tokensMatch = tokens.every((t) => normalizedName.includes(t));
      const collapsedMatch = collapsedQuery.length > 0 && collapsedName.includes(collapsedQuery);
      if (!tokensMatch && !collapsedMatch) continue;
      // Prefix matches rank first - the full name (or one of its words, or
      // its collapsed form) starting with what was actually typed reads as
      // a much stronger match than the query merely appearing mid-word
      // (typing "tom" should surface Tom Cruise before Marisa Tomei).
      const isPrefixMatch =
        normalizedName.startsWith(tokens[0]) ||
        normalizedName.split(" ").some((w) => w.startsWith(tokens[0])) ||
        collapsedName.startsWith(collapsedQuery);
      if (isPrefixMatch) prefixMatches.push(actor);
      else otherMatches.push(actor);
      // Once both tiers already hold enough candidates to fill MAX_RESULTS
      // regardless of how the rest of the (degree-sorted) list would
      // partition, further scanning can't change the final slice below.
      if (prefixMatches.length >= MAX_RESULTS && otherMatches.length >= MAX_RESULTS) break;
    }
    return [...prefixMatches, ...otherMatches].slice(0, MAX_RESULTS);
  }, [normalizedActors, query]);

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
    <div className="tus-search" ref={containerRef}>
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
        className="tus-search-input"
        aria-label="Search for an actor"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={LISTBOX_ID}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? `tus-search-option-${activeOption.id}` : undefined}
      />
      {isOpen && (
        <ul className="tus-search-results" id={LISTBOX_ID} role="listbox">
          {matches.map((actor, i) => {
            // The whole page is faces - this is the one place someone's
            // asked to recognize a bare name instead. w92 at 24 rendered px
            // matches how graph.ts already picks image sizes elsewhere (a
            // small node still needs 2x pixels for a real screen's DPR).
            const thumb = photoUrl(actor, 24);
            return (
              <li key={actor.id}>
                <button
                  type="button"
                  id={`tus-search-option-${actor.id}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={i === activeIndex ? "tus-search-option-active" : undefined}
                  onClick={() => select(actor)}
                >
                  {thumb ? (
                    <img className="tus-search-option-photo" src={thumb} alt="" width={24} height={24} />
                  ) : (
                    <span className="tus-search-option-photo tus-search-option-photo-fallback" aria-hidden="true" />
                  )}
                  {actor.name}
                </button>
              </li>
            );
          })}
          {statusMessage && (
            <li className="tus-search-status" role="presentation">
              {statusMessage}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
