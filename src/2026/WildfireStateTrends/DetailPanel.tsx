import { useRef } from "react";
import type { Metric, StateTrend } from "./types";
import { SMOKE_GROUP_LABEL, SMOKE_GROUP_SEVERITY } from "./types";
import {
  DETAIL_FRAME,
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
  hoveredYearIndex: number | null;
  onHover: (state: StateTrend, yearIndex: number | null, clientX: number, clientY: number) => void;
  onBack: () => void;
}

const SEVERITY_VAR: Record<string, string> = {
  critical: "var(--status-critical)",
  serious: "var(--status-serious)",
  warning: "var(--status-warning)",
  neutral: "var(--muted)",
};

export default function DetailPanel({ state, metric, breakYear, hoveredYearIndex, onHover, onBack }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const frame = DETAIL_FRAME;
  const { x, y } = buildScales(state, metric, frame);
  const { observed, counterfactual } = seriesForMetric(state, metric);

  const observedSplit = buildSplitLinePaths(state.years, observed, x, y, ORIGINAL_DATA_LAST_YEAR);
  const counterfactualSplit = buildSplitLinePaths(state.years, counterfactual, x, y, ORIGINAL_DATA_LAST_YEAR);
  // Only the "mean" metric was extended past 2022 (see chartGeometry's
  // ORIGINAL_DATA_LAST_YEAR comment) — check this metric's own series, not
  // just state.years generically, or the note below would talk about a
  // dashed segment that isn't actually on screen for "extreme days".
  const hasExtension = state.years.some(
    (yr, i) => yr > ORIGINAL_DATA_LAST_YEAR && (observed[i] !== null || counterfactual[i] !== null)
  );
  const breakX = x(breakYear);

  const xTicks = x.ticks(Math.min(8, state.years.length));
  const yTicks = y.ticks(5);
  const isPct = metric === "extreme";

  const severity =
    metric === "mean"
      ? SMOKE_GROUP_SEVERITY[state.meanClass?.smokeGroup ?? "no smoke influence detected"]
      : state.extremeClass?.smokeInfluenced
        ? "warning"
        : "neutral";
  const label =
    metric === "mean"
      ? SMOKE_GROUP_LABEL[state.meanClass?.smokeGroup ?? "no smoke influence detected"]
      : state.extremeClass?.smokeInfluenced
        ? "Smoke-influenced"
        : "No smoke influence detected";

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * frame.width;
    const idx = nearestYearIndex(state.years, x, px);
    onHover(state, idx, e.clientX, e.clientY);
  }

  // Touch pointers fire pointerleave right after pointerup — a tap "leaves"
  // the surface the instant the finger lifts, unlike a mouse, which only
  // leaves when the cursor physically exits the element. Clearing on that
  // would make the tooltip vanish within the same tap that opened it, so
  // only mouse-type pointers clear on leave; a touch tap's marker persists
  // until the next tap moves it.
  function handleLeave(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "touch") return;
    onHover(state, null, 0, 0);
  }

  return (
    <div className="wst-detail">
      <button type="button" className="wst-detail__back" onClick={onBack}>
        ← All states
      </button>

      <div className="wst-detail__head">
        <h2>{state.name}</h2>
        {state.region && <span className="wst-detail__region">{state.region.replace(/\s*\(.*\)/, "")}</span>}
      </div>

      <div className="wst-detail__badge">
        <span className="wst-detail__swatch" style={{ background: SEVERITY_VAR[severity] }} aria-hidden />
        {label}
      </div>

      <svg
        ref={svgRef}
        className="wst-detail__svg"
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        style={{ viewTransitionName: `wst-chart-${state.abbr}` } as React.CSSProperties}
        onPointerDown={handleMove}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      >
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line
              x1={frame.marginLeft}
              x2={frame.width - frame.marginRight}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
            <text x={frame.marginLeft - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="wst-detail__tick">
              {isPct ? `${(t * 100).toFixed(0)}%` : t.toFixed(0)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={`x-${t}`}
            x={x(t)}
            y={frame.height - frame.marginBottom + 16}
            textAnchor="middle"
            className="wst-detail__tick"
          >
            {t}
          </text>
        ))}

        {breakX > frame.marginLeft && (
          <line
            x1={breakX}
            x2={breakX}
            y1={frame.marginTop}
            y2={frame.height - frame.marginBottom}
            stroke="var(--baseline)"
            strokeWidth={1}
            strokeDasharray="4,3"
          />
        )}

        <path d={counterfactualSplit.mainPath} fill="none" stroke="var(--series-1)" strokeWidth={2} />
        <path d={observedSplit.mainPath} fill="none" stroke="var(--text-primary)" strokeWidth={2} />
        <path
          d={counterfactualSplit.extPath}
          fill="none"
          stroke="var(--series-1)"
          strokeWidth={2}
          strokeDasharray="4,3"
        />
        <path
          d={observedSplit.extPath}
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth={2}
          strokeDasharray="4,3"
        />
        {hoveredYearIndex !== null && (
          <HoverMarkers
            years={state.years}
            observed={observed}
            counterfactual={counterfactual}
            x={x}
            y={y}
            yearIndex={hoveredYearIndex}
            frame={frame}
            radius={4}
          />
        )}
      </svg>

      <div className="wst-detail__legend">
        <span>
          <span className="wst-detail__swatch" style={{ background: "var(--text-primary)" }} aria-hidden />
          Observed
        </span>
        <span>
          <span className="wst-detail__swatch" style={{ background: "var(--series-1)" }} aria-hidden />
          Counterfactual without smoke
        </span>
        <span className="wst-detail__breaklabel">┊ {Math.round(breakYear)} break year</span>
      </div>

      {hasExtension && (
        <p className="wst-detail__extnote">
          Dashed segment ({ORIGINAL_DATA_LAST_YEAR + 1}+): extended past the original paper's data using EPA AQS
          pulled directly, joined with a newer smoke-PM methodology from the same research group — not part of
          the original replication data, and not run through the same breakpoint/classification analysis.
        </p>
      )}
    </div>
  );
}
