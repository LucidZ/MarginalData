import { useRef } from "react";
import type { Metric, StateTrend } from "./types";
import { SMOKE_SHARE_TINT } from "./types";
import {
  TILE_FRAME,
  buildScales,
  buildLinePath,
  seriesForMetric,
  smokeShare,
  smokeExtremeDays,
  nearestYearIndex,
  formatYTick,
  referenceYearX,
  SMOKE_SHARE_START_YEAR,
} from "./chartGeometry";
import HoverMarkers from "./HoverMarkers";

interface Props {
  state: StateTrend;
  metric: Metric;
  isSelected: boolean;
  hoveredYearIndex: number | null;
  sharedYDomain: [number, number] | null;
  onHover: (state: StateTrend, yearIndex: number | null, clientX: number, clientY: number) => void;
  onSelect: (state: StateTrend) => void;
}

export default function StateTile({
  state,
  metric,
  isSelected,
  hoveredYearIndex,
  sharedYDomain,
  onHover,
  onSelect,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { x, y } = buildScales(state, metric, TILE_FRAME, sharedYDomain ?? undefined);
  const { observed, counterfactual } = seriesForMetric(state, metric);

  const tint =
    metric === "mean"
      ? SMOKE_SHARE_TINT[smokeShare(state).tier]
      : SMOKE_SHARE_TINT[smokeExtremeDays(state).tier];

  const observedPath = buildLinePath(state.years, observed, x, y);
  const counterfactualPath = buildLinePath(state.years, counterfactual, x, y);

  // The contiguous-US tile isn't a state — give it the footprint of a 2x2
  // block of state tiles so it reads as the headline reference line, same
  // relative sizing as the paper's own figure, instead of getting squeezed
  // into a single small-multiple cell.
  const isUS = state.abbr === "US";
  const spanRows = isUS ? 2 : 1;
  const spanCols = isUS ? 2 : 1;
  const [xDomainStart, xDomainEnd] = x.domain();
  const refX = referenceYearX(x, [xDomainStart, xDomainEnd], SMOKE_SHARE_START_YEAR);

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * TILE_FRAME.width;
    const idx = nearestYearIndex(state.years, x, px);
    onHover(state, idx, e.clientX, e.clientY);
  }

  // See DetailPanel's identical handler for why touch is excluded here.
  function handleLeave(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "touch") return;
    onHover(state, null, 0, 0);
  }

  return (
    <button
      type="button"
      className={`wst-tile${isSelected ? " wst-tile--selected" : ""}${isUS ? " wst-tile--us" : ""}`}
      style={
        {
          gridRow: `${state.row} / span ${spanRows}`,
          gridColumn: `${state.col} / span ${spanCols}`,
          ["--tile-tint" as string]: tint,
        } as React.CSSProperties
      }
      onClick={() => onSelect(state)}
      aria-label={`${state.name}: view details`}
    >
      <span className="wst-tile__label">{isUS ? state.name : state.abbr}</span>
      <svg
        ref={svgRef}
        className="wst-tile__svg"
        viewBox={`0 0 ${TILE_FRAME.width} ${TILE_FRAME.height}`}
        preserveAspectRatio="none"
        onPointerDown={handleMove}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        style={{ viewTransitionName: isSelected ? `wst-chart-${state.abbr}` : undefined } as React.CSSProperties}
      >
        <rect
          x={0}
          y={0}
          width={TILE_FRAME.width}
          height={TILE_FRAME.height}
          fill="var(--tile-tint)"
          opacity={0.16}
        />
        {refX !== null && (
          <line
            x1={refX}
            x2={refX}
            y1={TILE_FRAME.marginTop}
            y2={TILE_FRAME.height - TILE_FRAME.marginBottom}
            stroke="var(--muted)"
            strokeWidth={1}
            strokeDasharray="1.5 1.5"
            opacity={0.5}
          />
        )}
        <path d={counterfactualPath} fill="none" stroke="var(--series-1)" strokeWidth={1.3} />
        <path d={observedPath} fill="none" stroke="var(--text-primary)" strokeWidth={1.3} />
        {hoveredYearIndex !== null && (
          <HoverMarkers
            years={state.years}
            observed={observed}
            counterfactual={counterfactual}
            x={x}
            y={y}
            yearIndex={hoveredYearIndex}
            frame={TILE_FRAME}
            radius={1.6}
          />
        )}
      </svg>
      {/* The US tile is the one place in the grid that prints the shared
          scale as actual numbers — every other state tile stays bare (see
          MetricGrid) so 49 repeated labels don't turn into visual noise;
          this one tile, sized up for its bigger frame, is the reference. */}
      {isUS && sharedYDomain && (
        <>
          {/* "0" isn't shown — every metric here is non-negative, so a
              floor of zero is self-evident and printing it just repeated
              the ceiling's job without adding information. Four corners,
              four distinct facts: abbreviation, y-ceiling, start year,
              end year. */}
          <span className="wst-tile__tick wst-tile__tick--ymax">{formatYTick(sharedYDomain[1], metric)}</span>
          <span className="wst-tile__tick wst-tile__tick--xstart">{Math.round(xDomainStart)}</span>
          <span className="wst-tile__tick wst-tile__tick--xend">{Math.round(xDomainEnd)}</span>
        </>
      )}
    </button>
  );
}
