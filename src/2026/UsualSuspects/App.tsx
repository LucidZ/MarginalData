import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ActorNode from "./ActorNode";
import { COMPACT_LAYOUT, DESKTOP_LAYOUT, layoutBeeswarm, type Column } from "./beeswarm";
// A small pre-baked slice of the full pool - a handful of well-connected
// actors' complete real ego-networks (same GraphData shape as the fetched
// file). Bundled into this route's own JS chunk, so the default view can
// render the instant the chunk loads: no fetch, no spinner, nothing to wait
// on. `useData()`'s full ~3MB fetch still runs in the background for
// search-any-actor - see the `data ?? defaultActors` merge below, and
// scripts/generate-usual-suspects-defaults.mjs for how this file is derived.
import defaultActorsRaw from "./defaultActors.json";
import DetailCard, { type Selection } from "./DetailCard";
import { buildAdjacency, bucketCostars, photoUrl } from "./graph";
import SearchBox from "./SearchBox";
import { useData } from "./useData";
import type { Actor, GraphData, Movie } from "./types";
import "./App.css";

const defaultActors = defaultActorsRaw as unknown as GraphData & { defaultActorIds: number[] };

// Reserved strip at the very top of the frame for the axis label row - it's
// the same y for every column (see axisLabelY below) so the row reads as a
// header rather than a per-column caption.
const HEADER_HEIGHT = 22;
// How far each column's count label sits above that column's own swarm top -
// stays ragged (unlike the header) so it reads as attached to its pile.
const COUNT_LABEL_GAP = 20;
// Clear air between the header row and the tallest column's count label.
const HEADER_GAP = 24;
const BOTTOM_PAD = 12;
const COMPACT_BREAKPOINT = 640;
// Floor under the height budget 1b derives from the viewport - below this a
// column has nowhere left to shrink avatars into.
const MIN_CHART_HEIGHT = 360;
// Air left below the viewport-derived chart height so the frame doesn't
// press flush against the bottom edge of the screen.
const VIEWPORT_GUTTER = 24;
// Floor on the uniform SVG scale (see `scale` below) - past this text stops
// being legible, so a chart that would need more shrinking just scrolls
// vertically instead. 0.65 rather than a rounder 0.7: once a bucket's count
// pushes sizeForBucket's computed diameter below minNodeSize (beeswarm.ts),
// avatar size clamps to that floor and stops shrinking with the target, so
// the pack's real height stops responding to how much we compress the
// layout - only the very tallest actors in the pool land here.
//
// Re-measured 2026-09-09 after the pool grew to 2,839 actors (the
// --min-votes-sum5 fame fix), which pushed the biggest singleton buckets
// from ~227 to 278 (Samuel L. Jackson) and 268 (Willem Dafoe). The floor no
// longer guarantees a fit at 1440x900: Dafoe pins 0.65 but needs 0.626, and
// De Niro pins it needing 0.643, so both overflow the bottom by 5-19px and
// fall back to the vertical scroll this floor exists to allow. Jackson,
// oddly, is no longer one of them (he settles at 0.692, inside the floor).
// Dropping the floor to ~0.62 would restore the fit at the cost of the
// legibility this constant is protecting - deliberately not done here.
const MIN_SCALE = 0.65;
// Real minimum touch-target radius, in CSS px - half of the ~44px guideline.
// Divided by `scale` below wherever it's used, since this needs to hold
// after the uniform SVG scale-down, not in viewBox units.
const MIN_HIT_RADIUS = 22;

/** Shape of a valid ?actor= value - an IMDb person id, e.g. "nm0000158". */
const NCONST_PATTERN = /^nm\d+$/;

/** Sentinel rootId for "the URL names an actor we haven't loaded yet". Nothing
 * resolves it: actorById.get() misses, so no chart renders, and bucketCostars
 * returns [] for an unknown root (adj.get(rootId) ?? []). */
const ROOT_PENDING = -1;

function pickRandomDefaultActor(): Actor {
  const ids = defaultActors.defaultActorIds;
  const id = ids[Math.floor(Math.random() * ids.length)];
  // defaultActorIds and actors are written by the same script from the same
  // pool file, so this lookup can't miss - the ?? is to avoid asserting.
  return defaultActors.actors.find((a) => a.id === id) ?? defaultActors.actors[0];
}

function filmLabel(n: number, compact: boolean): string {
  if (compact) return `${n}`;
  return `${n} film${n === 1 ? "" : "s"} together`;
}

/** One entry per rendered node, in the order roving-tabindex keyboard nav
 * should walk them: column-major (left to right), then top to bottom within
 * a column - each column's entries land contiguously, which moveWithinColumn
 * relies on to know it hasn't spilled into the next column. */
interface FlatNode {
  id: number;
  columnIndex: number;
  y: number;
  sharedMovies: Movie[];
}

function buildFlatNodes(columns: Column[]): FlatNode[] {
  const result: FlatNode[] = [];
  columns.forEach((col, columnIndex) => {
    const sorted = [...col.actors].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      result.push({ id: p.id, columnIndex, y: p.y, sharedMovies: p.sharedMovies });
    }
  });
  return result;
}

/** Up/Down: step to the adjacent entry, but only if it's still in the same
 * column - a column's entries are contiguous in `flatNodes` (see
 * buildFlatNodes), so stepping past either end of that block would
 * otherwise silently spill into the neighboring column instead of stopping. */
function moveWithinColumn(flatNodes: FlatNode[], index: number, delta: number): number {
  const current = flatNodes[index];
  if (!current) return index;
  const next = index + delta;
  if (next < 0 || next >= flatNodes.length || flatNodes[next].columnIndex !== current.columnIndex) {
    return index;
  }
  return next;
}

/** Left/Right: skip past any empty (gap) columns in that direction, then
 * land on whichever node in the first non-empty one sits closest in y to the
 * node being left - not just that column's first node - so horizontal
 * movement feels spatial rather than resetting to the top every time. */
function moveToAdjacentColumn(flatNodes: FlatNode[], columns: Column[], index: number, direction: 1 | -1): number {
  const current = flatNodes[index];
  if (!current) return index;
  let col = current.columnIndex + direction;
  while (col >= 0 && col < columns.length && columns[col].actors.length === 0) col += direction;
  if (col < 0 || col >= columns.length) return index;
  let bestIndex = index;
  let bestDist = Infinity;
  flatNodes.forEach((n, i) => {
    if (n.columnIndex !== col) return;
    const dist = Math.abs(n.y - current.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  });
  return bestIndex;
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

export default function App() {
  const { data, error } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  // Only ever used when there's no usable ?actor= (see rootId below) -
  // memoized so it's picked once per mount, from the bundled default slice,
  // before the full pool has even started downloading (see the
  // defaultActors.json import above), and doesn't reroll on every render.
  // Its numeric id is safe to use directly: the slice is generated from the
  // same pool file in the same build, so their ids always agree. That's only
  // true *within* a build, which is exactly why the URL below can't use ids.
  const fallbackActor = useMemo(pickRandomDefaultActor, []);
  const [selection, setSelection] = useState<Selection | null>(null);
  const viewportWidth = useViewportWidth();
  const compact = viewportWidth < COMPACT_BREAKPOINT;

  // How much vertical room is actually left for the chart, measured from
  // wherever it starts down to the bottom of the viewport - lets the layout
  // shrink to fit instead of running off the bottom of the screen.
  const frameRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = frameRef.current;
      if (!el) return;
      // Document-space top of the chart region. Depends only on the header
      // and banner above it, never on the chart's own height, so feeding
      // this back into the layout below cannot oscillate.
      const top = el.getBoundingClientRect().top + window.scrollY;
      setAvailable(Math.max(MIN_CHART_HEIGHT, window.innerHeight - top - VIEWPORT_GUTTER));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [compact]);

  const layout = useMemo(() => {
    const base = compact ? COMPACT_LAYOUT : DESKTOP_LAYOUT;
    if (available == null) return base;
    // Leave room inside the budget for the header row and the tallest
    // column's count label, which sit above the swarm itself.
    const columnBudget = available - HEADER_HEIGHT - HEADER_GAP - COUNT_LABEL_GAP - BOTTOM_PAD;
    return { ...base, targetColumnHeight: Math.max(240, columnBudget) };
  }, [compact, available]);

  // Render from the small bundled slice until the full pool finishes
  // loading in the background, then switch over. Same rootId, same shape of
  // data, so everything downstream just recomputes against the authoritative
  // full graph - no separate "refresh" step needed, and for a rootId that
  // was in the default slice the result is identical (that slice is that
  // actor's real, complete ego-network), so the swap is invisible.
  const activeData: GraphData = data ?? defaultActors;
  // Drives SearchBox's empty-state message - "ready" is the only state where
  // a non-match actually means "not in this pool" rather than "hasn't
  // loaded yet" or "never going to load this session".
  const searchStatus: "loading" | "error" | "ready" = data ? "ready" : error ? "error" : "loading";

  const adjacency = useMemo(() => buildAdjacency(activeData), [activeData]);

  const actorById = useMemo(() => {
    const map = new Map<number, Actor>();
    activeData.actors.forEach((a) => map.set(a.id, a));
    return map;
  }, [activeData]);

  const movieById = useMemo(() => {
    const map = new Map<number, Movie>();
    activeData.movies.forEach((m) => map.set(m.id, m));
    return map;
  }, [activeData]);

  // The URL keys on IMDb nconst, so resolving a link needs this index rather
  // than actorById. Every actor in the pool has one and they're unique
  // (verified across all 2,839), so this is total, not best-effort.
  const actorByNconst = useMemo(() => {
    const map = new Map<string, Actor>();
    activeData.actors.forEach((a) => map.set(a.nconst, a));
    return map;
  }, [activeData]);

  // The root actor comes from ?actor=<nconst> when there's a usable one,
  // otherwise the memoized random fallback.
  //
  // This param is an IMDb person id ("nm0000158"), NOT the actor's numeric
  // id in the pool. Pool ids are positional - the generator sorts actors by
  // co-star degree and indexes from there - so they are only meaningful
  // within one generated file. Regenerating the pool on 2026-09-09 (a fame
  // filter fix, 2,465 -> 2,839 actors) shifted them wholesale: id 98 went
  // from Ethan Hawke to Adam Sandler. Every link anyone had shared would
  // have silently pointed at a different actor - not broken, which someone
  // might report, just wrong. nconst comes from IMDb and never moves.
  //
  // "Usable" has three outcomes, not two, because of the same
  // bundled-slice/full-pool swap SearchBox's status prop deals with:
  //  - known: the nconst is already in actorByNconst (bundled slice or full
  //    pool) - honor it.
  //  - pending: not found yet, but the full pool is still loading, so it
  //    might resolve once that lands - a shared link must never flash the
  //    fallback actor before settling on the right one. rootId holds
  //    ROOT_PENDING (so no chart renders) and a loading message shows in
  //    its place.
  //  - invalid: either malformed (anything that isn't nm-digits, which
  //    includes the old numeric-id links) or well-formed but absent from a
  //    pool that has settled. Falls back to random, and a separate effect
  //    scrubs it from the URL so a reload doesn't repeat the same dead end.
  const rawParam = searchParams.get("actor");
  const paramNconst = rawParam != null && NCONST_PATTERN.test(rawParam) ? rawParam : null;
  const paramMalformed = rawParam != null && paramNconst == null;
  const paramActor = paramNconst != null ? actorByNconst.get(paramNconst) : undefined;
  const paramPending = paramNconst != null && !paramActor && searchStatus === "loading";
  const paramInvalid = paramMalformed || (paramNconst != null && !paramActor && !paramPending);
  const rootId = paramActor ? paramActor.id : paramPending ? ROOT_PENDING : fallbackActor.id;

  useEffect(() => {
    if (paramInvalid) setSearchParams({}, { replace: true });
  }, [paramInvalid, setSearchParams]);

  const buckets = useMemo(
    () => bucketCostars(adjacency, actorById, movieById, rootId),
    [adjacency, actorById, movieById, rootId],
  );

  const columns = useMemo(() => layoutBeeswarm(buckets, layout), [buckets, layout]);

  // Roving tabindex: the <svg> itself is the one tab stop (see its tabIndex
  // below), and arrow keys move real DOM focus between nodes, which is what
  // lets Tab skip the whole chart in one hop instead of stopping at each of
  // 200+ nodes individually the way giving every node tabIndex=0 used to.
  const flatNodes = useMemo(() => buildFlatNodes(columns), [columns]);
  const nodeRefs = useRef(new Map<number, SVGGElement>());
  const [focusedIndex, setFocusedIndex] = useState(0);
  // Only a genuine recenter (a different actor) resets this - a background
  // full-pool data swap or a viewport-driven layout change can also change
  // `flatNodes` without this firing, and shouldn't yank focus away from
  // wherever the user currently is. safeFocusedIndex below covers the
  // (normally momentary) gap where `flatNodes` has already updated for
  // those reasons but this hasn't reset, so it never reads out of bounds.
  useLayoutEffect(() => {
    setFocusedIndex(0);
  }, [rootId]);
  const safeFocusedIndex = flatNodes.length === 0 ? 0 : Math.min(focusedIndex, flatNodes.length - 1);

  const focusNodeAt = (index: number) => {
    const node = flatNodes[index];
    if (!node) return;
    setFocusedIndex(index);
    const el = nodeRefs.current.get(node.id);
    el?.focus();
    el?.scrollIntoView({ inline: "nearest", block: "nearest" });
  };

  // Enter/Space on the focused node - mirrors a click's onSelect, but there's
  // no MouseEvent to read coordinates from, so the card anchors off the
  // focused node's own real position instead (its center, via
  // getBoundingClientRect) rather than defaulting to the viewport corner.
  const activateFocusedNode = () => {
    const node = flatNodes[safeFocusedIndex];
    if (!node) return;
    const actor = actorById.get(node.id);
    if (!actor) return;
    const rect = nodeRefs.current.get(node.id)?.getBoundingClientRect();
    setSelection({
      actor,
      sharedMovies: node.sharedMovies,
      clientX: rect ? rect.left + rect.width / 2 : 0,
      clientY: rect ? rect.top + rect.height / 2 : 0,
    });
  };

  const onGraphKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (flatNodes.length === 0) return;
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusNodeAt(moveToAdjacentColumn(flatNodes, columns, safeFocusedIndex, 1));
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusNodeAt(moveToAdjacentColumn(flatNodes, columns, safeFocusedIndex, -1));
        break;
      case "ArrowDown":
        e.preventDefault();
        focusNodeAt(moveWithinColumn(flatNodes, safeFocusedIndex, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        focusNodeAt(moveWithinColumn(flatNodes, safeFocusedIndex, -1));
        break;
      case "Home":
        e.preventDefault();
        focusNodeAt(0);
        break;
      case "End":
        e.preventDefault();
        focusNodeAt(flatNodes.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        activateFocusedNode();
        break;
      default:
        break;
    }
  };

  // Tab lands on the <svg> itself (that's the one tab stop), which on its
  // own has no visible indication of *which* node is "current" - this hands
  // real DOM focus down to that node the instant the svg is targeted, so the
  // node's own :focus ring (App.css) shows immediately. Guarded to the
  // svg being the actual target (not a bubbled focus event from the node
  // this just focused) so it can't recurse.
  const onGraphFocus = (e: React.FocusEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget) return;
    const node = flatNodes[safeFocusedIndex];
    if (!node) return;
    nodeRefs.current.get(node.id)?.focus();
  };

  // Signals whether the chart scrolls sideways past what's currently in
  // view, so the edge gradients (see .tus-graph-frame in App.css) only show
  // up when there's actually more to see - otherwise a chart that already
  // fits the frame (most actors, after phases 2-3) would render a
  // permanent, meaningless hint.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      // A couple px of tolerance so subpixel layout rounding at either end
      // doesn't flicker the gradient on and off.
      const EDGE_THRESHOLD = 2;
      setOverflow({
        left: el.scrollLeft > EDGE_THRESHOLD,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_THRESHOLD,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // columns captures every reason the rendered chart's width could change
    // (recenter, the background data swap, a layout/compact change) - re-run
    // whenever it does, since scrollWidth only reflects the latest render
    // once this effect fires after it.
  }, [columns]);
  const overflowTokens = [overflow.left && "left", overflow.right && "right"].filter(Boolean).join(" ") || undefined;

  // Pushes a new URL entry (default setSearchParams behavior), not a
  // replace - so Back walks through recenter history the same way it would
  // any other navigation, undoing one recenter per press.
  const recenter = (actor: Actor) => {
    setSearchParams({ actor: actor.nconst });
    setSelection(null);
  };

  // Preserves the old random-on-load discovery affordance now that loading
  // no longer rerolls it on every visit - picks fresh each press rather than
  // reusing `fallbackActor`, so repeated shuffles don't get stuck on one actor.
  const shuffle = () => {
    setSearchParams({ actor: pickRandomDefaultActor().nconst });
    setSelection(null);
  };

  const root = actorById.get(rootId) ?? null;
  const totalCostars = buckets.reduce((sum, b) => sum + b.entries.length, 0);

  // Frame runs 1..(this actor's own highest shared-film count) - see
  // layoutBeeswarm for why the empty tail out to the dataset-wide max of 20
  // is trimmed. Height is fit to this actor's tallest column rather than a
  // fixed worst-case constant - a flat reservation sized for a column that
  // fills targetColumnHeight left a dead band above the chart for anyone
  // whose busiest bucket doesn't approach that (i.e. almost everyone: the
  // packing math undershoots the target more the smaller a bucket is, and
  // most actors' tallest bucket is a mid-size one, not the dataset-wide
  // max). Trading the old "never jerks vertically on recenter" guarantee for
  // that space back - the banner and column count already change on
  // recenter, so a height change alongside them isn't a new kind of jump.
  const firstColumn = columns[0];
  const lastColumn = columns[columns.length - 1];
  // Left/right edges follow each end column's own halfWidth rather than a
  // flat sideMargin - a first or last column packed wider than sideMargin
  // (a small bucket of large avatars, e.g.) would otherwise clip.
  const viewLeft = firstColumn ? -Math.max(layout.sideMargin, firstColumn.halfWidth) : -layout.sideMargin;
  const viewRight = lastColumn ? lastColumn.x + Math.max(layout.sideMargin, lastColumn.halfWidth) : layout.sideMargin;
  const frameWidth = viewRight - viewLeft;
  const tallestTop = columns.length ? Math.min(...columns.map((c) => c.top)) : -layout.targetColumnHeight;
  // The axis label row sits at a uniform y (frameMinY + HEADER_HEIGHT) for
  // every column - unlike the count labels, which stay ragged above each
  // column's own top - so the row reads as one header rather than a
  // per-column caption.
  const frameMinY = tallestTop - COUNT_LABEL_GAP - HEADER_GAP - HEADER_HEIGHT;
  const axisLabelY = frameMinY + HEADER_HEIGHT - 6;
  const frameHeight = -frameMinY + BOTTOM_PAD;
  const viewBox = `${viewLeft} ${frameMinY} ${frameWidth} ${frameHeight}`;

  // Packing undershoots targetColumnHeight by a variable amount (see
  // sizeForBucket/packColumn in beeswarm.ts), so the viewport-derived target
  // above narrows things most of the way but doesn't guarantee a fit. This
  // uniform scale on the rendered SVG is the guarantee: it only ever needs
  // to close a small remaining gap, so in practice it should sit close to 1
  // - if it's routinely near MIN_SCALE, the budget math above is off, not
  // this floor.
  const maxFrameHeight = available ?? frameHeight;
  const scale = Math.max(MIN_SCALE, Math.min(1, maxFrameHeight / frameHeight));

  const rootPhoto = root ? photoUrl(root, 56) : null;
  // The bold number above each column has no unit of its own ("175" reads as
  // a bare value) - giving just the first (leftmost, always non-empty for
  // anyone with real costars) column's count a unit establishes what every
  // column's number means without repeating it down the whole row.
  const firstLabeledColumnFilms = columns.find((c) => c.actors.length > 0)?.sharedFilms;

  return (
    <div className="tus-root">
      <header className="tus-header">
        <h1>The Usual Suspects</h1>
        <p className="tus-subtitle">
          {/* Four name-drops before any explanation: the pairs do the work of
              defining what this is, and they double as the answer to "what
              would I even type in". All four are verified against the shipped
              pool - Depp/Bonham Carter 7 films, Johnson/Hart 4, Gosling/Stone
              and Reeves/Ryder 3 each - so clicking any of them lands on a
              chart that backs the claim rather than contradicting it. Re-check
              them if the pool is ever regenerated or swapped to Pool B. */}
          Johnny Depp and Helena Bonham Carter. Ryan Gosling and Emma Stone.
          Dwayne "The Rock" Johnson and Kevin Hart. Keanu Reeves and Winona
          Ryder. Some actors share the silver screen more than others. Type a
          name
          {/* Gated on `data` (the full pool), not `activeData` - the bundled
              default slice's count (1,612) is real but wrong for this claim
              until the full pool (2,839) lands, so the figure is omitted
              rather than shown wrong for the first ~2s of every load. */}
          {data && <> from this pool of {data.actors.length.toLocaleString()} actors</>} to see
          their costars, and {compact ? "tap" : "click"} on anyone to see the films they share.
        </p>
        <div className="tus-search-row">
          <SearchBox actors={activeData.actors} status={searchStatus} onSelect={(actor) => recenter(actor)} />
          <button type="button" className="tus-shuffle" onClick={shuffle}>
            Shuffle
          </button>
        </div>
        {error && !data && (
          <p className="tus-error-note">
            Showing a small sample - the full pool didn't load ({error.message}), so search only
            covers the actors already on screen.
          </p>
        )}
      </header>

      {paramPending && <p className="tus-root-loading">Loading this actor…</p>}

      {root && (
        <>
          <div className="tus-root-banner">
            {rootPhoto ? (
              <img className="tus-root-photo" src={rootPhoto} alt="" />
            ) : (
              <div className="tus-root-photo tus-root-photo-fallback" />
            )}
            <div>
              {root.tmdbId ? (
                <a
                  className="tus-root-name tus-person-link"
                  href={`https://www.themoviedb.org/person/${root.tmdbId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {root.name}
                </a>
              ) : (
                <div className="tus-root-name">{root.name}</div>
              )}
              <div className="tus-root-meta">
                {totalCostars.toLocaleString()} costars across this pool
              </div>
            </div>
          </div>

          {compact && (
            // On mobile the per-column labels are bare numbers (see
            // filmLabel) - this is the one place the unit they're counting
            // gets spelled out. It sits directly above the chart rather than
            // below (where its predecessor, .tus-axis-note, used to live)
            // so it's visible without scrolling, and outside the svg so it
            // can't collide with a column's own number label.
            <p className="tus-axis-unit-note">Columns: films together</p>
          )}
          <div className="tus-graph-frame" ref={frameRef} data-overflow={overflowTokens}>
            <div className="tus-graph-scroll" ref={scrollRef}>
              <svg
                className="tus-graph"
                viewBox={viewBox}
                width={frameWidth * scale}
                height={frameHeight * scale}
                // role="img" (the original role here) hides all of its
                // children from assistive tech, which would make every
                // node's role="button" invisible to it - "group" exposes
                // the nodes while this aria-label still describes the whole
                // chart.
                role="group"
                aria-label={`Costars of ${root.name}, grouped by shared film count`}
                // The one tab stop for the whole chart - see the flatNodes/
                // focusedIndex roving-tabindex machinery above. Individual
                // nodes are tabIndex={-1} (ActorNode.tsx).
                tabIndex={0}
                onKeyDown={onGraphKeyDown}
                onFocus={onGraphFocus}
              >
                <line className="tus-baseline" x1={viewLeft} x2={viewRight} y1={0} y2={0} />
                {columns.map((col) => (
                  <g key={col.sharedFilms}>
                    {col.actors.length > 0 && (
                      <text className="tus-count-label" x={col.x} y={col.top - COUNT_LABEL_GAP} textAnchor="middle">
                        {col.sharedFilms === firstLabeledColumnFilms
                          ? `${col.actors.length} costars`
                          : col.actors.length}
                      </text>
                    )}
                    <text
                      className={col.isEmpty ? "tus-axis-label tus-axis-label-empty" : "tus-axis-label"}
                      x={col.x}
                      y={axisLabelY}
                      textAnchor="middle"
                    >
                      {/* An empty (gap) column is only EMPTY_COLUMN_HALF_WIDTH*2
                          wide (beeswarm.ts) - "13 films together" doesn't fit
                          there, so it falls back to the bare number regardless
                          of compact. */}
                      {col.isEmpty ? col.sharedFilms : filmLabel(col.sharedFilms, compact)}
                    </text>
                    {col.actors.map((p) => {
                      const actor = actorById.get(p.id);
                      if (!actor) return null;
                      return (
                        <ActorNode
                          key={p.id}
                          actor={actor}
                          x={col.x + p.x}
                          y={p.y}
                          size={p.size}
                          hitRadius={Math.max(p.size / 2, MIN_HIT_RADIUS / scale)}
                          sharedMovies={p.sharedMovies}
                          isSelected={selection?.actor.id === actor.id}
                          onSelect={(a, movies, e) =>
                            setSelection({ actor: a, sharedMovies: movies, clientX: e.clientX, clientY: e.clientY })
                          }
                          domRef={(el) => {
                            if (el) nodeRefs.current.set(p.id, el);
                            else nodeRefs.current.delete(p.id);
                          }}
                        />
                      );
                    })}
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {selection && (
            <DetailCard
              // Keyed by actor id so a new selection is a fresh mount - its
              // position state (DetailCard.tsx) starts from a fresh estimate
              // instead of carrying over the previous card's corrected top.
              key={selection.actor.id}
              selection={selection}
              rootActor={root}
              compact={compact}
              onCenter={recenter}
              onClose={() => setSelection(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
