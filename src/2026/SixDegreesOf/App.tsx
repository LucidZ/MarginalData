import { useEffect, useMemo, useState } from "react";
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

const AXIS_LABEL_HEIGHT = 28;
const COUNT_LABEL_GAP = 20;
const TOP_MARGIN = 40;
const COMPACT_BREAKPOINT = 640;

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
  const layout = compact ? COMPACT_LAYOUT : DESKTOP_LAYOUT;

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
  const frameMinY = tallestTop - TOP_MARGIN - COUNT_LABEL_GAP;
  const frameHeight = -frameMinY + AXIS_LABEL_HEIGHT + 10;
  const viewBox = `${viewLeft} ${frameMinY} ${frameWidth} ${frameHeight}`;

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

          <div className="sdo-graph-scroll">
            <svg
              className="sdo-graph"
              viewBox={viewBox}
              width={frameWidth}
              height={frameHeight}
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
                  <text className="sdo-axis-label" x={col.x} y={AXIS_LABEL_HEIGHT - 6} textAnchor="middle">
                    {filmLabel(col.sharedFilms, compact)}
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
          {compact && <p className="sdo-axis-note">Columns: films made together</p>}

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
