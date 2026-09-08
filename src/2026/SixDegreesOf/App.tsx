import { useEffect, useMemo, useState } from "react";
import LoadingSpinner from "../../components/LoadingSpinner";
import ActorNode from "./ActorNode";
import { COMPACT_LAYOUT, DESKTOP_LAYOUT, layoutBeeswarm } from "./beeswarm";
import DetailCard, { type Selection } from "./DetailCard";
import { buildAdjacency, bucketCostars, photoUrl } from "./graph";
import SearchBox from "./SearchBox";
import { useData } from "./useData";
import type { Actor, Movie } from "./types";
import "./App.css";

const AXIS_LABEL_HEIGHT = 28;
const COUNT_LABEL_GAP = 20;
const TOP_MARGIN = 40;
const COMPACT_BREAKPOINT = 640;

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
  const [rootId, setRootId] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const viewportWidth = useViewportWidth();
  const compact = viewportWidth < COMPACT_BREAKPOINT;
  const layout = compact ? COMPACT_LAYOUT : DESKTOP_LAYOUT;

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

  const columns = useMemo(() => (buckets ? layoutBeeswarm(buckets, layout) : null), [buckets, layout]);

  const recenter = (actor: Actor) => {
    setRootId(actor.id);
    setSelection(null);
  };

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

  // Frame runs 1..(this actor's own highest shared-film count) - see
  // layoutBeeswarm for why the empty tail out to the dataset-wide max of 20
  // is trimmed. Height stays fixed so switching actors never jerks vertically.
  const columnCount = columns?.length ?? 0;
  const frameWidth = columnCount * layout.columnWidth + layout.sideMargin * 2;
  const frameMinY = -(layout.targetColumnHeight * 1.22 + TOP_MARGIN + COUNT_LABEL_GAP);
  const frameHeight = -frameMinY + AXIS_LABEL_HEIGHT + 10;
  const viewBox = `${-layout.sideMargin} ${frameMinY} ${frameWidth} ${frameHeight}`;

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
        <SearchBox actors={data.actors} onSelect={(actor) => recenter(actor)} />
      </header>

      {root === null || root === undefined ? (
        <p className="sdo-empty">Search for an actor above to get started.</p>
      ) : (
        <>
          <div className="sdo-root-banner">
            {rootPhoto ? (
              <img className="sdo-root-photo" src={rootPhoto} alt="" />
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
              width={frameWidth}
              height={frameHeight}
              role="img"
              aria-label={`Costars of ${root.name}, grouped by shared film count`}
            >
              <line
                className="sdo-baseline"
                x1={-layout.sideMargin}
                x2={frameWidth - layout.sideMargin}
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
