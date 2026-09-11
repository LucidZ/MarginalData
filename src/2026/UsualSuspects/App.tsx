import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ActorNode from "./ActorNode";
import { COMPACT_ROWS, DESKTOP_ROWS, layoutRows, type Row } from "./beeswarm";
// A small pre-baked slice of the full pool - a handful of well-connected
// actors' complete real ego-networks (same GraphData shape as the fetched
// file). Bundled into this route's own JS chunk, so the default view can
// render the instant the chunk loads: no fetch, no spinner, nothing to wait
// on. `useData()`'s full ~3MB fetch still runs in the background for
// search-any-actor - see the `data ?? defaultActors` merge below, and
// scripts/generate-usual-suspects-defaults.mjs for how this file is derived.
import defaultActorsRaw from "./defaultActors.json";
import DetailCard, { type Selection } from "./DetailCard";
import InfoPanel from "./InfoPanel";
import { buildAdjacency, bucketCostars, photoUrl, type Bucket } from "./graph";
import SearchBox from "./SearchBox";
import { useData } from "./useData";
import type { Actor, GraphData, Movie } from "./types";
import "./App.css";

const defaultActors = defaultActorsRaw as unknown as GraphData & { defaultActorIds: number[] };

// Width reserved at the left of the chart for each row's own label ("26 films
// together"). A left gutter costs nothing vertically, which is the whole
// reason the labels could go back to being words: the previous horizontal
// arrangement had to cut the same text to a bare number because its 108px
// width forced a 184px minimum footprint onto every column.
const LABEL_GUTTER = 132;
const COMPACT_LABEL_GUTTER = 92;
// Air below the last row so the chart doesn't end flush against the footer.
const BOTTOM_PAD = 24;
const COMPACT_BREAKPOINT = 640;
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

/** Row labels are words again. Under the previous horizontal arrangement
 * this had to be a bare number: "12 films together" measured 108px, which
 * forced a 184px minimum footprint onto every column whether it held 207
 * people or one. Stacking rows puts the label in a left gutter instead,
 * where its width costs no vertical space at all, so the only constraint
 * left is the gutter itself - hence the shorter form on compact. */
function filmLabel(n: number, compact: boolean): string {
  if (compact) return `${n} film${n === 1 ? "" : "s"}`;
  return `${n} film${n === 1 ? "" : "s"} together`;
}

/** One entry per rendered node, in the order roving-tabindex keyboard nav
 * should walk them: top row first, then left to right within a row - each
 * row's entries land contiguously, which moveWithinRow relies on to know it
 * hasn't spilled into the next row. Also doubles as the index the
 * nearest-center click overlay searches (see resolveNearestNode below).
 * x/y are absolute chart coordinates for that, not the row-local ones
 * PositionedActor carries. */
interface FlatNode {
  id: number;
  rowIndex: number;
  x: number;
  y: number;
  size: number;
  sharedMovies: Movie[];
  name?: string;
}

function buildFlatNodes(rows: Row[], gutter: number): FlatNode[] {
  const result: FlatNode[] = [];
  rows.forEach((row, rowIndex) => {
    const sorted = [...row.actors].sort((a, b) => a.x - b.x);
    for (const p of sorted) {
      result.push({
        id: p.id,
        rowIndex,
        x: gutter + p.x,
        y: row.y + p.y,
        size: p.size,
        sharedMovies: p.sharedMovies,
        name: p.name,
      });
    }
  });
  return result;
}

/** Converts a client-space (viewport) point into the SVG's own viewBox
 * coordinates via its screen CTM - shared by the click overlay and the
 * hover readout below, both of which need to know where the pointer
 * actually is in the same coordinate space `flatNodes` positions live in.
 * Deliberately not hand-rolled off getBoundingClientRect: the CTM already
 * accounts for the page's own scroll offset, and for any difference between
 * the svg's rendered width and its viewBox width. */
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
 * happened to paint last. Linear scan is deliberate: even the pool's
 * largest chart is cheap enough per click that a spatial index would be
 * solving a problem that doesn't exist here. */
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

/** Left/Right: step to the adjacent entry, but only if it's still in the
 * same row - a row's entries are contiguous in `flatNodes` (see
 * buildFlatNodes), so stepping past either end of that block would
 * otherwise silently spill into the neighbouring row instead of stopping. */
function moveWithinRow(flatNodes: FlatNode[], index: number, delta: number): number {
  const current = flatNodes[index];
  if (!current) return index;
  const next = index + delta;
  if (next < 0 || next >= flatNodes.length || flatNodes[next].rowIndex !== current.rowIndex) {
    return index;
  }
  return next;
}

/** Up/Down: skip past any empty (break) rows in that direction, then land on
 * whichever node in the first populated one sits closest in x to the node
 * being left - not just that row's first node - so vertical movement feels
 * spatial rather than resetting to the left edge every time. */
function moveToAdjacentRow(flatNodes: FlatNode[], rows: Row[], index: number, direction: 1 | -1): number {
  const current = flatNodes[index];
  if (!current) return index;
  let row = current.rowIndex + direction;
  while (row >= 0 && row < rows.length && rows[row].actors.length === 0) row += direction;
  if (row < 0 || row >= rows.length) return index;
  let bestIndex = index;
  let bestDist = Infinity;
  flatNodes.forEach((n, i) => {
    if (n.rowIndex !== row) return;
    const dist = Math.abs(n.x - current.x);
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
  const [infoOpen, setInfoOpen] = useState(false);
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

  // How wide the chart's own container actually is. The vertical
  // arrangement fills whatever width the viewport gives it and grows
  // downward, so width is the only dimension that has to be measured -
  // there is no height budget any more, and no uniform down-scaling of the
  // whole chart to make it fit one.
  //
  // Held as state rather than a ref, and depended on below, because the
  // frame is rendered inside `{root && ...}` and so does not exist on every
  // mount. With a plain ref this effect ran once, found the ref null, and
  // bailed - permanently, since nothing ever re-ran it. That used to leave
  // every actor outside the bundled default slice (720 of 2,839) and every
  // fallback from an invalid ?actor= with no layout budget at all, because
  // those render the "Loading this actor…" message on first commit and the
  // frame only on a later one.
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!frameEl) return;
    const measure = () => {
      // Content box, not clientWidth: clientWidth includes the frame's own
      // horizontal padding, and feeding that in made the viewBox wider than
      // the svg's rendered width. preserveAspectRatio then scaled the whole
      // chart down to fit and centred it vertically inside the height we had
      // asked for - 133px of dead space above the first row on a 390px
      // phone, 26px on desktop, both of which read as a layout bug rather
      // than as breathing room.
      const style = getComputedStyle(frameEl);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      setFrameWidth(frameEl.clientWidth - padding);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frameEl);
    return () => observer.disconnect();
  }, [frameEl]);

  const gutter = compact ? COMPACT_LABEL_GUTTER : LABEL_GUTTER;
  const layout = useMemo(() => {
    const base = compact ? COMPACT_ROWS : DESKTOP_ROWS;
    // Falls back to a sensible first-paint width so the chart renders
    // something real before the ResizeObserver has reported - it re-lays out
    // on the very next frame either way.
    const width = frameWidth ?? (compact ? 358 : 1200);
    return { ...base, contentWidth: Math.max(160, width - gutter) };
  }, [compact, frameWidth, gutter]);

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
  // No ?actor= at all - someone arrived at the page itself rather than at a
  // shared link to one actor. The only state where the cold-open copy earns
  // its space; see the context line below.
  const isLanding = rawParam == null;
  const rootId = paramActor ? paramActor.id : paramPending ? ROOT_PENDING : fallbackActor.id;

  useEffect(() => {
    if (paramInvalid) setSearchParams({}, { replace: true });
  }, [paramInvalid, setSearchParams]);

  const buckets = useMemo(
    () => bucketCostars(adjacency, actorById, movieById, rootId),
    [adjacency, actorById, movieById, rootId],
  );

  const { rows, height: rowsHeight } = useMemo(
    () => layoutRows(buckets, layout, (id) => actorById.get(id)?.name ?? ""),
    [buckets, layout, actorById],
  );

  // Roving tabindex: the <svg> itself is the one tab stop (see its tabIndex
  // below), and arrow keys move real DOM focus between nodes, which is what
  // lets Tab skip the whole chart in one hop instead of stopping at each of
  // 200+ nodes individually the way giving every node tabIndex=0 used to.
  const flatNodes = useMemo(() => buildFlatNodes(rows, gutter), [rows, gutter]);
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

  // Recenter as navigation, not a page load. Without this a recenter is a
  // hard cut: 200-plus faces vanish and 200-plus different ones appear in
  // the same frame, and the overlap between the two charts - often dozens of
  // people, since costars of costars are frequently costars - is invisible.
  // A FLIP pass animates whoever is in both charts from where they were to
  // where they now are, so the shared cast reads as moving between rows
  // rather than as two unrelated screens.
  //
  // Keyed on flatNodes but gated on rootId actually having changed, because
  // flatNodes also churns for reasons that must NOT animate: a viewport
  // resize, and the background full-pool swap that re-buckets the chart a
  // second or two into every visit. Animating those would make the chart
  // twitch while someone is reading it.
  //
  // Positions are read from the layout rather than the DOM: the values are
  // already exact (the svg renders 1:1 with its viewBox), so there's nothing
  // to measure and no forced reflow to pay for.
  const previousLayout = useRef<{ rootId: number; positions: Map<number, { x: number; y: number; size: number }> } | null>(
    null,
  );
  useLayoutEffect(() => {
    const positions = new Map(flatNodes.map((n) => [n.id, { x: n.x, y: n.y, size: n.size }]));
    const previous = previousLayout.current;
    previousLayout.current = { rootId, positions };
    if (!previous || previous.rootId === rootId) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    for (const node of flatNodes) {
      const el = nodeRefs.current.get(node.id);
      if (!el) continue;
      const before = previous.positions.get(node.id);
      if (!before) {
        // Newly arrived in this chart - nothing to move from, so fade in.
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
        continue;
      }
      const moved = Math.hypot(before.x - node.x, before.y - node.y);
      const resized = Math.abs(before.size / node.size - 1);
      if (moved < 1 && resized < 0.01) continue;
      // ActorNode positions each node with a transform *attribute*; a CSS
      // transform from the animation overrides it for the animation's
      // duration and then hands back to the attribute when it finishes
      // (fill defaults to none), which is exactly the FLIP handoff we want -
      // no cleanup, and no risk of a stuck inline transform if a recenter
      // interrupts another one mid-flight.
      el.animate(
        [
          { transform: `translate(${before.x}px, ${before.y}px) scale(${before.size / node.size})` },
          { transform: `translate(${node.x}px, ${node.y}px) scale(1)` },
        ],
        { duration: 420, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
      );
    }
  }, [flatNodes, rootId]);

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
    // preventScroll, then an explicit scrollIntoView: .focus()'s own default
    // scrolling centres the element, which on a chart taller than the
    // viewport means every arrow-key step jumps the page around. "nearest"
    // moves only as far as it has to.
    el?.focus({ preventScroll: true });
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
        focusNodeAt(moveWithinRow(flatNodes, safeFocusedIndex, 1));
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusNodeAt(moveWithinRow(flatNodes, safeFocusedIndex, -1));
        break;
      case "ArrowDown":
        e.preventDefault();
        focusNodeAt(moveToAdjacentRow(flatNodes, rows, safeFocusedIndex, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        focusNodeAt(moveToAdjacentRow(flatNodes, rows, safeFocusedIndex, -1));
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
    // preventScroll is load-bearing here, not a nicety. Clicking anywhere on
    // the chart focuses the <svg>, which lands here and hands focus down to
    // whichever node is current - index 0 by default, i.e. the very top row.
    // A bare .focus() scrolls that node into view, so every single click
    // anywhere in the chart snapped the page back to the top. It went
    // unnoticed while the chart fitted one screenful and there was nothing
    // to scroll; stacking rows made the page taller than the viewport and
    // turned it into the most obvious bug on the page.
    nodeRefs.current.get(node.id)?.focus({ preventScroll: true });
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

  // The scroll-edge gradient machinery that used to live here is gone with
  // the horizontal scroll it existed to cue. Nothing is off to the side any
  // more: the chart fills the frame's width and grows downward, so the only
  // scroll is the page's own.

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

  // The chart is exactly as wide as its frame and as tall as its rows need,
  // so there's no viewport fitting to do: no uniform scale, no height budget,
  // no MIN_SCALE floor. All three existed to squeeze a horizontal chart into
  // the space below the header, and all three are gone with it - which also
  // means avatars now render at exactly the size the layout picked, rather
  // than at 65-90% of it.
  const chartWidth = gutter + layout.contentWidth;
  const chartHeight = rowsHeight + BOTTOM_PAD;
  const viewBox = `0 0 ${chartWidth} ${chartHeight}`;

  const rootPhoto = root ? photoUrl(root, 48) : null;
  // The leftmost column used to carry its count as "207 costars" so the bare
  // numbers below it had a unit. That worked under the old ascending axis,
  // where leftmost meant the 1-film pile and 207 was a real number; under
  // descending it's the closest-collaborator column, so it read "1 costars".
  // Both units are named once in .tus-axis-unit-note above the chart now.

  // Hover label geometry - everything here lives in viewBox units, like
  // everything else drawn inside the <svg>. These used to be divided by the
  // chart's uniform render scale to keep them a constant on-screen size;
  // with the vertical arrangement the svg renders 1:1 with its viewBox, so
  // viewBox units and CSS px are the same thing and the divisor is gone.
  // Skipped on a named row: the name is already rendered beside the face
  // there, so a hover label would only repeat it on top of itself.
  const hoveredCandidate = hoveredNodeId != null ? (flatNodes.find((n) => n.id === hoveredNodeId) ?? null) : null;
  const hoveredNode = hoveredCandidate?.name ? null : hoveredCandidate;
  const hoveredActor = hoveredNode ? (actorById.get(hoveredNode.id) ?? null) : null;
  const HOVER_LABEL_FONT_SIZE = 13;
  const HOVER_LABEL_PAD_X = 8;
  const HOVER_LABEL_PAD_Y = 5;
  const HOVER_LABEL_GAP = 10;
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
    // Default above the node; flip below when that would climb off the top
    // of the chart.
    const y = above >= 0 ? above : nodeBottom + HOVER_LABEL_GAP;
    const x = Math.min(Math.max(hoveredNode.x - width / 2, 0), chartWidth - width);
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
            <button
              type="button"
              className="tus-info-toggle"
              onClick={() => setInfoOpen((open) => !open)}
              aria-expanded={infoOpen}
              aria-label="About this chart"
              title="About this chart"
            >
              i
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
                {/* The four-pair cold open, shown only on the bare landing
                    state. It's doing real work there - naming duos someone
                    already has a feel for, then landing on one they don't -
                    and it would be dead weight on a deep link, where the
                    generated headline above already says something specific
                    about the actor in front of them. The landing page opens
                    centred on one of these eight at random
                    (SUBTITLE_ACTOR_NCONSTS), so the sentence someone just
                    read is also the chart they're looking at.

                    No numbers in this copy, deliberately: the figures that
                    used to be quoted for these pairs in a comment here went
                    stale when commit 4bc930f supplemented the edges, and the
                    prose never carried them in the first place. The exact
                    counts live in .claude/usual-suspects-refit-spec.md and
                    are re-derived from the data everywhere they're shown. */}
                {isLanding ? (
                  <>
                    Ryan Gosling and Emma Stone. Dwayne "The Rock" Johnson and Kevin Hart. Keanu
                    Reeves and Winona Ryder. Adam Sandler and Allen Covert? Some actors share the
                    silver screen far more than others.{" "}
                  </>
                ) : (
                  <>Some actors share the silver screen far more than others. </>
                )}
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

          {/* One legend line instead of a per-row unit. The row labels in
              the gutter already say "N films together" in full - the
              vertical arrangement makes horizontal room free, so unlike the
              previous column layout there's no pressure to compress them to
              bare numbers. This only has to explain the count on the right. */}
          <p className="tus-axis-unit-note">
            Closest collaborators first. The number beside each row is how many people share
            that many films with {root.name}.
          </p>
          <div className="tus-graph-frame" ref={setFrameEl}>
            <svg
              className="tus-graph"
              viewBox={viewBox}
              width={chartWidth}
              height={chartHeight}
              // Belt and braces against the letterboxing described in the
              // width measurement above: if the viewBox and the rendered
              // width ever disagree again, pin the chart to the top-left
              // rather than silently scaling and centring it.
              preserveAspectRatio="xMinYMin meet"
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
                x={0}
                y={0}
                width={chartWidth}
                height={chartHeight}
                fill="transparent"
                pointerEvents="all"
                aria-hidden="true"
                onClick={onGraphBackgroundClick}
              />
              {rows.map((row) => (
                <g key={row.sharedFilms}>
                  {row.missing ? (
                    // A collapsed run of shared-film counts nobody has - the
                    // print convention for a broken axis, drawn once per gap
                    // rather than once per missing number. The row labels
                    // either side already bracket the range, so this only
                    // has to say that something is skipped here.
                    <text
                      className="tus-axis-break"
                      x={gutter - 12}
                      y={row.y + row.height / 2}
                      textAnchor="end"
                      dominantBaseline="central"
                      aria-label={
                        row.missing[0] === row.missing[1]
                          ? `no costars at ${row.missing[0]} films`
                          : `no costars between ${row.missing[1]} and ${row.missing[0]} films`
                      }
                    >
                      ⋯
                    </text>
                  ) : (
                    <>
                      {/* Row label and head count, both in the left gutter.
                          Anchored to the row's first line rather than its
                          vertical middle: a 207-person block is five lines
                          tall, and a label floating in the middle of it
                          reads as belonging to the line it happens to sit
                          beside rather than to the whole row. */}
                      <text
                        className="tus-row-label"
                        x={gutter - 12}
                        y={row.y + Math.min(row.height, 28)}
                        textAnchor="end"
                      >
                        {filmLabel(row.sharedFilms, compact)}
                      </text>
                      <text
                        className="tus-row-count"
                        x={gutter - 12}
                        y={row.y + Math.min(row.height, 28) + 17}
                        textAnchor="end"
                      >
                        {row.actors.length}
                      </text>
                    </>
                  )}
                  {row.actors.map((p) => {
                    const actor = actorById.get(p.id);
                    if (!actor) return null;
                    return (
                      <ActorNode
                        key={p.id}
                        actor={actor}
                        x={gutter + p.x}
                        y={row.y + p.y}
                        size={p.size}
                        label={p.name}
                        hitWidth={p.hitWidth}
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
                  unreadable). Only rendered for nodes that don't already
                  carry a visible name - see hoveredNode above.
                  pointerEvents="none" on the whole group: it's a read-only
                  label, not a second interactive surface - every real
                  interaction (links, "Center on") still lives in the
                  click-opened card. */}
              {hoverLabel && (
                <g pointerEvents="none">
                  <rect
                    className="tus-hover-label-bg"
                    x={hoverLabel.x}
                    y={hoverLabel.y}
                    width={hoverLabel.width}
                    height={hoverLabel.height}
                    rx={4}
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

          {infoOpen && (
            <InfoPanel
              actorCount={data?.actors.length ?? null}
              movieCount={data?.movies.length ?? null}
              onClose={() => setInfoOpen(false)}
            />
          )}

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
