import { useMemo, useRef, useState } from "react";
import LoadingSpinner from "../../components/LoadingSpinner";
import ActorNode from "./ActorNode";
import { COLUMN_WIDTH, layoutBeeswarm } from "./beeswarm";
import { buildAdjacency, bucketCostars, photoUrl } from "./graph";
import SearchBox from "./SearchBox";
import Tooltip, { type HoverInfo } from "./Tooltip";
import { useData } from "./useData";
import type { Actor, Movie } from "./types";
import "./App.css";

const AXIS_LABEL_HEIGHT = 28;
const COUNT_LABEL_GAP = 20;
const TOP_MARGIN = 40;
const MAX_COLUMN_CONTENT_HEIGHT = 1100;
const SIDE_MARGIN = 130;

function filmLabel(n: number): string {
  return `${n} film${n === 1 ? "" : "s"} together`;
}

export default function App() {
  const { data, error } = useData();
  const [rootId, setRootId] = useState<number | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  // Movie links need the tooltip to survive the mouse moving from the node
  // toward the tooltip itself, which briefly leaves the node's own hit area
  // - a short cancelable delay before hiding is what makes "hover to see
  // details, then click a link in that tooltip" actually work instead of the
  // tooltip vanishing the instant you move toward it.
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHide = () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimeout.current = setTimeout(() => setHover(null), 200);
  };

  const adjacency = useMemo(() => (data ? buildAdjacency(data) : null), [data]);

  const actorById = useMemo(() => {
    const map = new Map<number, Actor>();
    data?.actors.forEach((a) => map.set(a.id, a));
    return map;
  }, [data]);

  const movieById = useMemo(() => {
    const map = new Map<number, Movie>();
    data?.movies.forEach((m) => map.set(m.id, m));
    return map;
  }, [data]);

  const buckets = useMemo(() => {
    if (!adjacency || rootId === null) return null;
    return bucketCostars(adjacency, actorById, movieById, rootId);
  }, [adjacency, actorById, movieById, rootId]);

  const columns = useMemo(
    () => (buckets && data ? layoutBeeswarm(buckets, data.maxSharedFilms) : null),
    [buckets, data],
  );

  if (error) {
    return (
      <div className="sdo-root">
        <p className="sdo-error">Couldn't load the actor data: {error.message}</p>
      </div>
    );
  }
  if (!data) return <LoadingSpinner />;

  const root = rootId !== null ? actorById.get(rootId) : null;
  const totalCostars = buckets?.reduce((sum, b) => sum + b.entries.length, 0) ?? 0;

  // Fixed frame spanning every possible shared-film count (1..maxSharedFilms)
  // at a fixed x each, calibrated against the real dataset-wide max (checked
  // against the actual generated pool, not assumed - Anupam Kher needs 9 of
  // these columns, not the 5 you'd guess from Samuel L. Jackson, and someone
  // shares as many as 20 films with a costar) so the graph never resizes or
  // shifts meaning between actors. Smaller actors just leave columns blank
  // rather than the frame shrinking or the axis compressing.
  //
  // Rendered at true 1:1 (SVG pixel width/height == viewBox units, no CSS
  // scaling) inside a horizontally-scrolling wrapper - the earlier version
  // used width:100% to force-fit this into the page's ~1068px column, which
  // crushed 20 columns' worth of text into that width and made it unreadable
  // no matter the font-size. A fixed-size chart this wide needs real scroll,
  // not squashing.
  const maxColumns = data.maxSharedFilms;
  const fixedWidth = maxColumns * COLUMN_WIDTH + SIDE_MARGIN * 2;
  const fixedMinY = -(MAX_COLUMN_CONTENT_HEIGHT + TOP_MARGIN + COUNT_LABEL_GAP);
  const fixedHeight = -fixedMinY + AXIS_LABEL_HEIGHT + 10;
  const viewBox = `${-SIDE_MARGIN} ${fixedMinY} ${fixedWidth} ${fixedHeight}`;

  return (
    <div className="sdo-root">
      <header className="sdo-header">
        <h1>Six Degrees Of...</h1>
        <p className="sdo-subtitle">
          Type an actor's name. Every real costar of theirs (within this pool) shows up, grouped
          by how many films they've actually made together - nothing curated or capped. Hover
          anyone to see which films; click to re-center on them.
        </p>
        <SearchBox actors={data.actors} onSelect={(actor) => setRootId(actor.id)} />
      </header>

      {root === null || root === undefined ? (
        <p className="sdo-empty">Search for an actor above to get started.</p>
      ) : (
        <>
          <div className="sdo-root-banner">
            {photoUrl(root) ? (
              <img className="sdo-root-photo" src={photoUrl(root)!} alt={root.name} />
            ) : (
              <div className="sdo-root-photo sdo-root-photo-fallback" />
            )}
            <div>
              <div className="sdo-root-name">{root.name}</div>
              <div className="sdo-root-meta">
                {totalCostars.toLocaleString()} costars across this pool
              </div>
            </div>
          </div>

          <div className="sdo-graph-scroll">
            <svg
              className="sdo-graph"
              viewBox={viewBox}
              width={fixedWidth}
              height={fixedHeight}
              role="img"
              aria-label={`Costars of ${root.name}, grouped by shared film count`}
            >
              <line
                className="sdo-baseline"
                x1={-SIDE_MARGIN}
                x2={fixedWidth - SIDE_MARGIN}
                y1={0}
                y2={0}
              />
              {columns?.map((col) => (
                <g key={col.sharedFilms}>
                  {col.actors.length > 0 && (
                    <text className="sdo-count-label" x={col.x} y={col.top - COUNT_LABEL_GAP} textAnchor="middle">
                      {col.actors.length}
                    </text>
                  )}
                  <text className="sdo-axis-label" x={col.x} y={AXIS_LABEL_HEIGHT - 6} textAnchor="middle">
                    {filmLabel(col.sharedFilms)}
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
                        onClick={(a) => setRootId(a.id)}
                        onHover={(a, movies, e) => {
                          cancelHide();
                          setHover({ actor: a, sharedMovies: movies, clientX: e.clientX, clientY: e.clientY });
                        }}
                        onLeave={scheduleHide}
                      />
                    );
                  })}
                </g>
              ))}
            </svg>
          </div>
          {hover && <Tooltip hover={hover} onMouseEnter={cancelHide} onMouseLeave={scheduleHide} />}
        </>
      )}
    </div>
  );
}
