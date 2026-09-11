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
import { buildAdjacency, bucketCostars, photoUrl, type Bucket } from "./graph";
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
// Floor on how close a click/tap needs to land to a node's center to still
// resolve to it via the nearest-center overlay below, in viewBox units - a
// generous minimum for tiny avatars, growing with the avatar itself for
// bigger ones. Without a floor, a click in a large stretch of empty
// right-hand whitespace would still resolve to whatever node happens to be
// nearest, however far away.
const MIN_MATCH_RADIUS = 24;
// How many of a selected actor's own costars to prefetch photos for in the
// background (see the effect below) - the first N by shared-film weight
// (adjacency's own sort order), not all of them, so this can never
// meaningfully compete with the current view's own image requests for
// bandwidth even for someone with 300+ costars.
const PREFETCH_COUNT = 60;

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

// The eight actors named in the subtitle copy above, keyed by IMDb nconst
// (stable across pool regens - see the rootId comment below for why numeric
// ids aren't safe here even though this file's ids happen to agree with the
// current pool). Landing page opens centered on one of them at random, so
// the sentence someone just read is also the chart they see, instead of
// naming eight actors and then dropping them on someone else entirely.
const SUBTITLE_ACTOR_NCONSTS = [
  "nm0331516", // Ryan Gosling
  "nm1297015", // Emma Stone
  "nm0425005", // Dwayne Johnson
  "nm0366389", // Kevin Hart
  "nm0000206", // Keanu Reeves
  "nm0000213", // Winona Ryder
  "nm0001191", // Adam Sandler
  "nm0184445", // Allen Covert
];

function pickRandomSubtitleActor(): Actor {
  const nconst = SUBTITLE_ACTOR_NCONSTS[Math.floor(Math.random() * SUBTITLE_ACTOR_NCONSTS.length)];
  // All eight are costars of the bundled slice's own default actors (that's
  // how they ended up in the subtitle's shared-film claims in the first
  // place), so they're already present in defaultActors.actors - no need to
  // wait on the full pool fetch to land on one of them.
  const match = defaultActors.actors.find((a) => a.nconst === nconst);
  return match ?? pickRandomDefaultActor();
}

/** Everything after the root actor's own name in the one sentence a cold
 * arrival needs, built from the chart in front of them. The name itself is
 * rendered separately (and linked out to TMDB), so the line still reads as
 * one sentence - "Adam Sandler" + "and Allen Covert made 26 films together."
 * - while staying its own addressable element. A shared ?actor= link is exactly when someone shows up with no
 * context, so this can't be gated on entry point the way a landing-page
 * intro can - making it about the current actor is what earns it the space
 * instead. It's also the caption for the leftmost column, now that the axis
 * runs descending.
 *
 * 86.2% of the pool (2,446 of 2,839, measured) has a top collaborator at 2+
 * shared films, so the main sentence lands for almost everyone. The other
 * 393 are obscure, low-degree actors that Shuffle can't reach (it draws from
 * defaultActorIds) and only search finds - "made 1 films together" would be
 * both ungrammatical and a non-fact, so they get the count instead.
 *
 * Ties are broken on the lower pool id, which is free accuracy rather than
 * an arbitrary pick: ids are assigned in descending costar-degree order (see
 * the rootId comment below), so the lower id is the better-known name. Adam
 * Sandler's 23-film tie resolves to Rob Schneider, not Jonathan Loughran.
 */
function headlineFor(buckets: Bucket[], totalCostars: number): string | null {
  const top = buckets[0];
  if (!top || top.entries.length === 0) return null;
  if (top.sharedFilms < 2) {
    return `appears here with ${totalCostars.toLocaleString()} costars — one film each.`;
  }
  const best = top.entries.reduce((a, b) => (b.actor.id < a.actor.id ? b : a));
  return `and ${best.actor.name} made ${top.sharedFilms} films together.`;
}

/** Every column label is a bare number at every viewport now - the units are
 * spelled out once in the axis legend above the chart instead. Repeating
 * "films together" under each column measured 93-111px wide, which forced a
 * 184px minimum footprint per column whether it held 207 people or one; that
 * was roughly half of why Adam Sandler's chart was 3,351 units wide. */
function filmLabel(n: number): string {
  return `${n}`;
}

/** One entry per rendered node, in the order roving-tabindex keyboard nav
 * should walk them: column-major (left to right), then top to bottom within
 * a column - each column's entries land contiguously, which moveWithinColumn
 * relies on to know it hasn't spilled into the next column. Also doubles as
 * the index the nearest-center click overlay searches (see
 * resolveNearestNode below) - x/size are absolute viewBox coordinates for
 * that, not present on PositionedActor itself (which is column-local). */
interface FlatNode {
  id: number;
  columnIndex: number;
  x: number;
  y: number;
  size: number;
  sharedMovies: Movie[];
}

function buildFlatNodes(columns: Column[]): FlatNode[] {
  const result: FlatNode[] = [];
  columns.forEach((col, columnIndex) => {
    const sorted = [...col.actors].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      result.push({ id: p.id, columnIndex, x: col.x + p.x, y: p.y, size: p.size, sharedMovies: p.sharedMovies });
    }
  });
  return result;
}

/** Converts a client-space (viewport) point into the SVG's own viewBox
 * coordinates via its screen CTM - shared by the click overlay and the
 * hover readout below, both of which need to know where the pointer
 * actually is in the same coordinate space `flatNodes` positions live in.
 * Deliberately not hand-rolled off getBoundingClientRect: the chart carries
 * a uniform render-time `scale` (see App.tsx's own `scale` further down),
 * and the CTM already accounts for that plus any scroll offset within
 * `.tus-graph-scroll`. */
function clientToViewBox(svg: SVGSVGElement, clientX: number, clientY: number): DOMPoint | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(ctm.inverse());
}

/** Finds whichever rendered node's own center sits nearest a point in
 * viewBox coordinates - the resolution behind the nearest-center overlay
 * <rect> (see its own comment further down). A node with sub-44px avatars
 * packed closer than that used to rely on an inflated same-node hit circle
 * to stay reachable, which blanketed neighboring nodes' true centers
 * instead (see ActorNode.tsx); this searches every node's real position and
 * picks the closest one, so a click anywhere in the gaps between avatars
 * resolves to whichever face is actually nearest rather than whichever
 * happened to paint last. Linear scan is deliberate: even Samuel L.
 * Jackson's chart (the pool's largest, 351 nodes) is cheap enough per click
 * that a spatial index would be solving a problem that doesn't exist here. */
function resolveNearestNode(flatNodes: FlatNode[], x: number, y: number): FlatNode | null {
  let best: FlatNode | null = null;
  let bestDist = Infinity;
  for (const n of flatNodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  if (!best) return null;
  return bestDist <= Math.max(best.size / 2, MIN_MATCH_RADIUS) ? best : null;
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
  // Picks from the subtitle's eight named actors specifically (not the wider
  // defaultActorIds pool that Shuffle draws from) - see pickRandomSubtitleActor.
  const fallbackActor = useMemo(pickRandomSubtitleActor, []);
  const [selection, setSelection] = useState<Selection | null>(null);
  // Shared by both ways a node gets picked - a direct click on its own <g>
  // (ActorNode.tsx's onSelect) and a click that lands in the gap between
  // avatars, resolved by the nearest-center overlay below - so both paths
  // produce the exact same selection shape and the capture-phase
  // outside-click swap in DetailCard.tsx (which relies on a click always
  // landing outside `.tus-card` to close-then-reopen in one gesture) sees
  // no difference between them.
  const selectNode = (actor: Actor, sharedMovies: Movie[], clientX: number, clientY: number) => {
    setSelection({ actor, sharedMovies, clientX, clientY });
  };
  const viewportWidth = useViewportWidth();
  const compact = viewportWidth < COMPACT_BREAKPOINT;

  // How much vertical room is actually left for the chart, measured from
  // wherever it starts down to the bottom of the viewport - lets the layout
  // shrink to fit instead of running off the bottom of the screen.
  //
  // Held as state rather than a ref, and depended on below, because the
  // frame is rendered inside `{root && ...}` and so does not exist on every
  // mount. With a plain ref + `[compact]` deps this effect ran once, found
  // frameRef.current null, and bailed - permanently, since nothing ever
  // re-ran it - leaving `available` null and the chart with no height budget
  // at all. That hit every actor the bundled default slice doesn't cover
  // (720 of 2,839) and every fallback from an invalid ?actor=, because those
  // render the "Loading this actor…" message on first commit and the frame
  // only on a later one. Measured on that path: a 941px-tall chart on a
  // 900px viewport, running below the fold, while charts for slice actors
  // sized correctly - the kind of bug that looks like a data difference.
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!frameEl) return;
    const measure = () => {
      // Document-space top of the chart region. Depends only on the header
      // and banner above it, never on the chart's own height, so feeding
      // this back into the layout below cannot oscillate.
      const top = frameEl.getBoundingClientRect().top + window.scrollY;
      setAvailable(Math.max(MIN_CHART_HEIGHT, window.innerHeight - top - VIEWPORT_GUTTER));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [frameEl, compact]);

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

  // Opening a detail card telegraphs the likely next action - its own
  // "Center on X" button - so warm that actor's own costar photos while the
  // card is still open, rather than waiting for the recenter click to
  // start ~200 fresh image requests from zero on whatever connection the
  // browser happens to have that moment. requestIdleCallback (main-thread
  // idle time only, so it can't compete with rendering the card that just
  // opened) with a setTimeout fallback for Safari, which has never shipped
  // it. Skipped entirely under Data Saver - prefetching what someone might
  // click next is exactly the kind of speculative transfer that setting
  // exists to suppress.
  useEffect(() => {
    const actor = selection?.actor;
    if (!actor) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    const neighborIds = (adjacency.get(actor.id) ?? []).slice(0, PREFETCH_COUNT).map((n) => n.id);
    const warm = () => {
      for (const id of neighborIds) {
        const neighbor = actorById.get(id);
        const url = neighbor && photoUrl(neighbor, 24);
        if (url) new Image().src = url;
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(warm, 200);
    return () => window.clearTimeout(timer);
  }, [selection?.actor.id, adjacency, actorById]);

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

  // Hover readout (desktop): the SVG <title> a click-opened card replaced
  // was already the only way to read a name without clicking, and it's a
  // ~1s-delayed native OS tooltip - too slow to sweep across a dense column
  // reading faces. Stores just the id, not the whole FlatNode, so a stale
  // value from before a recenter can't paint a label at coordinates that no
  // longer mean anything - see the rootId-keyed reset below and the
  // re-lookup against the *current* flatNodes at render time.
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  useLayoutEffect(() => {
    setHoveredNodeId(null);
  }, [rootId]);

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

  // Backstop for clicks that land in the gap between avatars rather than on
  // any one node's own hit circle - see the transparent <rect> this handles,
  // rendered behind every node. Hands the resolved viewBox point off to
  // resolveNearestNode. A miss (nothing within MIN_MATCH_RADIUS) clears any
  // open selection instead of doing nothing - that's what lets a click in
  // empty whitespace close a card the same way clicking any other non-card
  // element already does.
  const onGraphBackgroundClick = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    const loc = svg && clientToViewBox(svg, e.clientX, e.clientY);
    if (!loc) return;
    const node = resolveNearestNode(flatNodes, loc.x, loc.y);
    if (!node) {
      setSelection(null);
      return;
    }
    const actor = actorById.get(node.id);
    if (!actor) return;
    selectNode(actor, node.sharedMovies, e.clientX, e.clientY);
  };

  // Hover readout: mirrors the click overlay's own nearest-center
  // resolution (same coordinate conversion, same MIN_MATCH_RADIUS cap), but
  // driven off pointer movement and only stored, not acted on - painting
  // the label itself is delegated to the render below (hoveredNode/
  // hoveredActor), so this only ever needs to track *which* node, not
  // compute anything about its position. Gated on the media query, not
  // `compact`: a tablet can be wide enough to render the non-compact layout
  // while still having no real hover state, and pointer events there arrive
  // as a single move-then-tap on touch, which would otherwise flash a label
  // right before every tap. Skips the setState entirely when the resolved
  // id hasn't changed, so dragging the mouse across one avatar's many
  // interior pixels doesn't re-render on every pixel of movement.
  const onGraphPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    const loc = clientToViewBox(e.currentTarget, e.clientX, e.clientY);
    if (!loc) return;
    const node = resolveNearestNode(flatNodes, loc.x, loc.y);
    const nextId = node?.id ?? null;
    setHoveredNodeId((prev) => (prev === nextId ? prev : nextId));
  };

  const onGraphPointerLeave = () => setHoveredNodeId(null);

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
  const headline = headlineFor(buckets, totalCostars);

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
  // Each end column's own halfWidth PLUS the side margin, not the larger of
  // the two. The old Math.max() form guaranteed only that an end column
  // couldn't clip; whenever its swarm was wider than sideMargin it left no
  // margin at all. That was invisible under the old ascending axis, where
  // the end columns were the high-shared-film buckets - one or two large
  // avatars, halfWidth ~32, comfortably under sideMargin - and became a real
  // bug the moment the axis flipped: descending puts the 200-plus-person
  // 1-film crowd at the right end, halfWidth ~141, so the margin collapsed
  // to zero and a click in what looks like empty space past the chart
  // resolved to whichever face was nearest instead of dismissing the open
  // card (caught by the "clicking in empty space past the last column"
  // test). Additive keeps both properties: never clips, always leaves a
  // real dead zone wider than MIN_MATCH_RADIUS at every render scale.
  const viewLeft = firstColumn ? -(firstColumn.halfWidth + layout.sideMargin) : -layout.sideMargin;
  const viewRight = lastColumn ? lastColumn.x + lastColumn.halfWidth + layout.sideMargin : layout.sideMargin;
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

  const rootPhoto = root ? photoUrl(root, 48) : null;
  // The leftmost column used to carry its count as "207 costars" so the bare
  // numbers below it had a unit. That worked under the old ascending axis,
  // where leftmost meant the 1-film pile and 207 was a real number; under
  // descending it's the closest-collaborator column, so it read "1 costars".
  // Both units are named once in .tus-axis-unit-note above the chart now.

  // Hover label geometry - everything here lives in viewBox units, like
  // everything else drawn inside the <svg>. Sizes are divided by `scale`:
  // the whole chart is uniformly scaled down on tall charts (MIN_SCALE
  // above), so a fixed viewBox size would render visibly smaller there than
  // on a chart that didn't need to shrink.
  const hoveredNode = hoveredNodeId != null ? (flatNodes.find((n) => n.id === hoveredNodeId) ?? null) : null;
  const hoveredActor = hoveredNode ? (actorById.get(hoveredNode.id) ?? null) : null;
  const HOVER_LABEL_FONT_SIZE = 13 / scale;
  const HOVER_LABEL_PAD_X = 8 / scale;
  const HOVER_LABEL_PAD_Y = 5 / scale;
  const HOVER_LABEL_GAP = 10 / scale;
  let hoverLabel: { x: number; y: number; width: number; height: number; text: string } | null = null;
  if (hoveredNode && hoveredActor) {
    const filmCount = hoveredNode.sharedMovies.length;
    const text = `${hoveredActor.name} · ${filmCount} film${filmCount === 1 ? "" : "s"}`;
    // Estimated off character count, not getComputedTextLength - the latter
    // forces a synchronous layout on every pointermove, and "close enough
    // not to clip" is all a backdrop rectangle needs.
    const width = text.length * HOVER_LABEL_FONT_SIZE * 0.55 + HOVER_LABEL_PAD_X * 2;
    const height = HOVER_LABEL_FONT_SIZE + HOVER_LABEL_PAD_Y * 2;
    const nodeTop = hoveredNode.y - hoveredNode.size / 2;
    const nodeBottom = hoveredNode.y + hoveredNode.size / 2;
    const above = nodeTop - HOVER_LABEL_GAP - height;
    // Default above the node; flip below when that would climb past the
    // header row - frameMinY is the very top of the chart's own reserved
    // space, above which nothing else is ever drawn.
    const y = above >= frameMinY ? above : nodeBottom + HOVER_LABEL_GAP;
    const x = Math.min(Math.max(hoveredNode.x - width / 2, viewLeft), viewRight - width);
    hoverLabel = { x, y, width, height, text };
  }

  return (
    <div className="tus-root">
      <div className="tus-chrome">
        <header className="tus-toolbar">
          <h1 className="tus-title">The Usual Suspects</h1>
          <div className="tus-search-row">
            <SearchBox actors={activeData.actors} status={searchStatus} onSelect={(actor) => recenter(actor)} />
            <button type="button" className="tus-shuffle" onClick={shuffle}>
              Shuffle
            </button>
          </div>
        </header>
        {error && !data && (
          <p className="tus-error-note">
            Showing a small sample - the full pool didn't load ({error.message}), so search only
            covers the actors already on screen.
          </p>
        )}
        {/* The five-line paragraph that used to live here is gone, replaced
            by the per-actor headline in the context row below (headlineFor).
            It cost 340px of chrome on desktop and 489px on a 390px phone -
            58% of the screen before a single face appeared - and on a deep
            link, which is the URL people actually share, three of its four
            name-drops weren't the chart you'd just landed on.

            Its four-pair cold open is still worth having on the bare landing
            state (no ?actor=), where it does real work; that's phase 4 in
            .claude/usual-suspects-ux-spec.md, which carries the copy. Do not
            restore it verbatim: every one of its counts is stale. Commit
            4bc930f moved all four - Gosling/Stone 3 -> 4, Johnson/Hart
            4 -> 5, Reeves/Ryder 3 -> 4, and Sandler/Covert 10 -> 26.
            SUBTITLE_ACTOR_NCONSTS above still lists exactly those eight, so
            the landing page keeps opening on one of them. */}
      </div>

      {paramPending && <p className="tus-root-loading">Loading this actor…</p>}

      {root && (
        <>
          <div className="tus-root-banner">
            {rootPhoto ? (
              // Keyed by its own src so a recenter remounts this <img>
              // instead of reusing the old element - browsers keep painting
              // the previous bitmap through a bare src swap until the new
              // one finishes decoding, which on a slow connection meant the
              // banner showed the *previous* actor's face next to the new
              // actor's name for as long as several seconds. A fresh mount
              // has nothing to paint until the new photo decodes, so it
              // goes blank instead - blank reads as loading; the wrong
              // person reads as broken.
              <img key={rootPhoto} className="tus-root-photo" src={rootPhoto} alt="" />
            ) : (
              <div className="tus-root-photo tus-root-photo-fallback" />
            )}
            <div>
              <p className="tus-headline">
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
                  <span className="tus-root-name">{root.name}</span>
                )}
                {headline && ` ${headline}`}
              </p>
              <p className="tus-context-meta">
                Some actors share the silver screen far more than others.{" "}
                {totalCostars.toLocaleString()} costars here
                {/* Gated on `data` (the full pool), not `activeData` - the
                    bundled default slice's count (1,612) is real but wrong
                    for this claim until the full pool (2,839) lands, so the
                    figure is omitted rather than shown wrong for the first
                    ~2s of every load. */}
                {data && <>, out of {data.actors.length.toLocaleString()} actors</>}.{" "}
                {compact ? "Tap" : "Click"} anyone to see the films they share.
                {/* Desktop-only accelerator (see ActorNode.tsx's
                    onDoubleClick) - left out on touch, where double-tap
                    means zoom and the bottom-sheet card's own "Center on"
                    button is already one tap away. */}
                {!compact && " Double-click to recenter."}
              </p>
            </div>
          </div>

          {/* Every column label is a bare number at every viewport now (see
              filmLabel), so this is where both units get named - once,
              rather than under all 13 of Adam Sandler's columns. Above the
              chart rather than below (where its predecessor, .tus-axis-note,
              used to live) so it's readable without scrolling, and outside
              the svg so it can't collide with a column's own number. */}
          <p className="tus-axis-unit-note">
            Columns are films made together, most at left. Bold numbers count the costars in each.
          </p>
          <div className="tus-graph-frame" ref={setFrameEl} data-overflow={overflowTokens}>
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
                onPointerMove={onGraphPointerMove}
                onPointerLeave={onGraphPointerLeave}
              >
                <line className="tus-baseline" x1={viewLeft} x2={viewRight} y1={0} y2={0} />
                {/* Nearest-center click backstop, behind every node (rendered
                    before them, so a click directly on an avatar still hits
                    the avatar's own circle first - this only catches the
                    gaps between densely packed faces, where the old inflated
                    per-node hit circle used to blanket whichever neighbor
                    painted on top. aria-hidden: it's a pointer/touch-only
                    convenience, not a distinct interactive element - every
                    node it can resolve to already has its own role="button"
                    reachable via the roving tabindex. */}
                <rect
                  x={viewLeft}
                  y={frameMinY}
                  width={frameWidth}
                  height={frameHeight}
                  fill="transparent"
                  pointerEvents="all"
                  aria-hidden="true"
                  onClick={onGraphBackgroundClick}
                />
                {columns.map((col) => (
                  <g key={col.sharedFilms}>
                    {col.actors.length > 0 && (
                      <text className="tus-count-label" x={col.x} y={col.top - COUNT_LABEL_GAP} textAnchor="middle">
                        {col.actors.length}
                      </text>
                    )}
                    {col.missing ? (
                      // A collapsed run of shared-film counts nobody has -
                      // the print convention for a broken axis, drawn once
                      // per gap rather than once per missing number. The
                      // numbers either side already say how wide the gap is
                      // (Sandler's 12 and 7 bracket a missing 11-8), so the
                      // marker itself only has to say "something is skipped
                      // here" - hence a glyph rather than a label, which
                      // also keeps it BREAK_HALF_WIDTH narrow.
                      <text
                        className="tus-axis-break"
                        x={col.x}
                        y={axisLabelY}
                        textAnchor="middle"
                        aria-label={
                          col.missing[0] === col.missing[1]
                            ? `no costars at ${col.missing[0]} films`
                            : `no costars between ${col.missing[1]} and ${col.missing[0]} films`
                        }
                      >
                        ⋯
                      </text>
                    ) : (
                      <text className="tus-axis-label" x={col.x} y={axisLabelY} textAnchor="middle">
                        {filmLabel(col.sharedFilms)}
                      </text>
                    )}
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
                          sharedMovies={p.sharedMovies}
                          isSelected={selection?.actor.id === actor.id}
                          onSelect={(a, movies, e) => selectNode(a, movies, e.clientX, e.clientY)}
                          onCenter={recenter}
                          domRef={(el) => {
                            if (el) nodeRefs.current.set(p.id, el);
                            else nodeRefs.current.delete(p.id);
                          }}
                        />
                      );
                    })}
                  </g>
                ))}
                {/* Hover readout - last child so it paints on top of every
                    node, anchored to the hovered node's own position (not
                    the cursor, which is what made the old hover tooltip
                    unreadable - see its removal note on .tus-node-ring's
                    sibling comment in App.css). pointerEvents="none" on the
                    whole group: it's a read-only label, not a second
                    interactive surface - every real interaction (links,
                    "Center on") still lives in the click-opened card. */}
                {hoverLabel && (
                  <g pointerEvents="none">
                    <rect
                      className="tus-hover-label-bg"
                      x={hoverLabel.x}
                      y={hoverLabel.y}
                      width={hoverLabel.width}
                      height={hoverLabel.height}
                      rx={4 / scale}
                    />
                    <text
                      className="tus-hover-label-text"
                      x={hoverLabel.x + HOVER_LABEL_PAD_X}
                      y={hoverLabel.y + hoverLabel.height / 2}
                      dominantBaseline="central"
                      style={{ fontSize: HOVER_LABEL_FONT_SIZE }}
                    >
                      {hoverLabel.text}
                    </text>
                  </g>
                )}
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
