import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ActorNode from "./ActorNode";
import { COMPACT_LAYOUT, DESKTOP_LAYOUT, layoutBeeswarm } from "./beeswarm";
// A small pre-baked slice of the full pool - a handful of well-connected
// actors' complete real ego-networks (same GraphData shape as the fetched
// file). Bundled into this route's own JS chunk, so the default view can
// render the instant the chunk loads: no fetch, no spinner, nothing to wait
// on. `useData()`'s full ~3MB fetch still runs in the background for
// search-any-actor - see the `data ?? defaultActors` merge below, and
// scripts/generate-six-degrees-defaults.mjs for how this file is derived.
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
// layout - only the tallest two actors in the whole pool (Samuel L. Jackson
// and Willem Dafoe, both ~227-person singleton buckets) land here, needing
// ~0.66; 0.7 left exactly those two overflowing the viewport by a hair.
const MIN_SCALE = 0.65;

function pickRandomDefaultActorId(): number {
  const ids = defaultActors.defaultActorIds;
  return ids[Math.floor(Math.random() * ids.length)];
}

function filmLabel(n: number, compact: boolean): string {
  if (compact) return `${n}`;
  return `${n} film${n === 1 ? "" : "s"} together`;
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
  // Picked once, from the bundled default slice, before the full pool has
  // even started downloading - see the defaultActors.json import above.
  const [rootId, setRootId] = useState<number>(pickRandomDefaultActorId);
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

  const buckets = useMemo(
    () => bucketCostars(adjacency, actorById, movieById, rootId),
    [adjacency, actorById, movieById, rootId],
  );

  const columns = useMemo(() => layoutBeeswarm(buckets, layout), [buckets, layout]);

  const recenter = (actor: Actor) => {
    setRootId(actor.id);
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

  return (
    <div className="sdo-root">
      <header className="sdo-header">
        <h1>Six Degrees Of...</h1>
        <p className="sdo-subtitle">
          Type an actor's name. Every real costar of theirs (within this pool) shows up, grouped
          by how many films they've actually made together - nothing curated or capped. Tap
          anyone to see the films they share.
        </p>
        <SearchBox actors={activeData.actors} onSelect={(actor) => recenter(actor)} />
        {error && !data && (
          <p className="sdo-error-note">
            Showing a small sample - the full pool didn't load ({error.message}), so search only
            covers the actors already on screen.
          </p>
        )}
      </header>

      {root && (
        <>
          <div className="sdo-root-banner">
            {rootPhoto ? (
              <img className="sdo-root-photo" src={rootPhoto} alt="" />
            ) : (
              <div className="sdo-root-photo sdo-root-photo-fallback" />
            )}
            <div>
              {root.tmdbId ? (
                <a
                  className="sdo-root-name sdo-person-link"
                  href={`https://www.themoviedb.org/person/${root.tmdbId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {root.name}
                </a>
              ) : (
                <div className="sdo-root-name">{root.name}</div>
              )}
              <div className="sdo-root-meta">
                {totalCostars.toLocaleString()} costars across this pool
              </div>
            </div>
          </div>

          {compact && (
            // On mobile the per-column labels are bare numbers (see
            // filmLabel) - this is the one place the unit they're counting
            // gets spelled out. It sits directly above the chart rather than
            // below (where its predecessor, .sdo-axis-note, used to live)
            // so it's visible without scrolling, and outside the svg so it
            // can't collide with a column's own number label.
            <p className="sdo-axis-unit-note">Columns: films together</p>
          )}
          <div className="sdo-graph-scroll" ref={frameRef}>
            <svg
              className="sdo-graph"
              viewBox={viewBox}
              width={frameWidth * scale}
              height={frameHeight * scale}
              role="img"
              aria-label={`Costars of ${root.name}, grouped by shared film count`}
            >
              <line className="sdo-baseline" x1={viewLeft} x2={viewRight} y1={0} y2={0} />
              {columns.map((col) => (
                <g key={col.sharedFilms}>
                  {col.actors.length > 0 && (
                    <text className="sdo-count-label" x={col.x} y={col.top - COUNT_LABEL_GAP} textAnchor="middle">
                      {col.actors.length}
                    </text>
                  )}
                  <text
                    className={col.isEmpty ? "sdo-axis-label sdo-axis-label-empty" : "sdo-axis-label"}
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
                        sharedMovies={p.sharedMovies}
                        isSelected={selection?.actor.id === actor.id}
                        onSelect={(a, movies, e) =>
                          setSelection({ actor: a, sharedMovies: movies, clientX: e.clientX, clientY: e.clientY })
                        }
                      />
                    );
                  })}
                </g>
              ))}
            </svg>
          </div>

          {selection && (
            <DetailCard
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
