import { useRef } from "react";
import type { Metric, StateTrend } from "./types";
import { SMOKE_GROUP_SEVERITY } from "./types";
import {
  TILE_FRAME,
  ORIGINAL_DATA_LAST_YEAR,
  buildScales,
  buildSplitLinePaths,
  seriesForMetric,
  nearestYearIndex,
} from "./chartGeometry";
import HoverMarkers from "./HoverMarkers";

interface Props {
  state: StateTrend;
  metric: Metric;
  breakYear: number;
  isSelected: boolean;
  hoveredYearIndex: number | null;
  sharedYDomain: [number, number] | null;
  onHover: (state: StateTrend, yearIndex: number | null, clientX: number, clientY: number) => void;
  onSelect: (state: StateTrend) => void;
}

const SEVERITY_VAR: Record<string, string> = {
  critical: "var(--status-critical)",
  serious: "var(--status-serious)",
  warning: "var(--status-warning)",
  neutral: "transparent",
};

export default function StateTile({
  state,
  metric,
  breakYear,
  isSelected,
  hoveredYearIndex,
  sharedYDomain,
  onHover,
  onSelect,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { x, y } = buildScales(state, metric, TILE_FRAME, sharedYDomain ?? undefined);
  const { observed, counterfactual } = seriesForMetric(state, metric);

  const severity =
    metric === "mean"
      ? SMOKE_GROUP_SEVERITY[state.meanClass?.smokeGroup ?? "no smoke influence detected"]
      : state.extremeClass?.smokeInfluenced
        ? "warning"
        : "neutral";
  const tint = SEVERITY_VAR[severity];

  const observedSplit = buildSplitLinePaths(state.years, observed, x, y, ORIGINAL_DATA_LAST_YEAR);
  const counterfactualSplit = buildSplitLinePaths(state.years, counterfactual, x, y, ORIGINAL_DATA_LAST_YEAR);
  const breakX = x(breakYear);

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
      className={`wst-tile${isSelected ? " wst-tile--selected" : ""}`}
      style={
        {
          gridRow: state.row,
          gridColumn: state.col,
          ["--tile-tint" as string]: tint,
        } as React.CSSProperties
      }
      onClick={() => onSelect(state)}
      aria-label={`${state.name}: view details`}
    >
      <span className="wst-tile__label">{state.abbr}</span>
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
        {breakX > TILE_FRAME.marginLeft && (
          <line
            x1={breakX}
            x2={breakX}
            y1={TILE_FRAME.marginTop}
            y2={TILE_FRAME.height - TILE_FRAME.marginBottom}
            stroke="var(--baseline)"
            strokeWidth={0.6}
            strokeDasharray="1.5,1.5"
          />
        )}
        <path d={counterfactualSplit.mainPath} fill="none" stroke="var(--series-1)" strokeWidth={1.3} />
        <path d={observedSplit.mainPath} fill="none" stroke="var(--text-primary)" strokeWidth={1.3} />
        <path
          d={counterfactualSplit.extPath}
          fill="none"
          stroke="var(--series-1)"
          strokeWidth={1.3}
          strokeDasharray="2,1.5"
        />
        <path
          d={observedSplit.extPath}
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth={1.3}
          strokeDasharray="2,1.5"
        />
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
    </button>
  );
}
