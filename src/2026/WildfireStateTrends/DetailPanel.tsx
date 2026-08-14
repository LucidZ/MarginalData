import { useRef } from "react";
import type { Metric, StateTrend } from "./types";
import { SMOKE_GROUP_LABEL, SMOKE_GROUP_SEVERITY } from "./types";
import { DETAIL_FRAME, buildScales, buildLinePath, seriesForMetric, nearestYearIndex } from "./chartGeometry";
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

  const observedPath = buildLinePath(state.years, observed, x, y);
  const counterfactualPath = buildLinePath(state.years, counterfactual, x, y);
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

        <path d={counterfactualPath} fill="none" stroke="var(--series-1)" strokeWidth={2} />
        <path d={observedPath} fill="none" stroke="var(--text-primary)" strokeWidth={2} />
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
    </div>
  );
}
