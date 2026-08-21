import { useMemo } from "react";
import StateTile from "./StateTile";
import { computeGlobalYDomain, formatYTick } from "./chartGeometry";
import type { Metric, StateTrend, WildfireDataset } from "./types";

export interface HoverInfo {
  state: StateTrend;
  metric: Metric;
  yearIndex: number;
  clientX: number;
  clientY: number;
}

interface Props {
  data: WildfireDataset;
  metric: Metric;
  title: string;
  hover: HoverInfo | null;
  onHover: (state: StateTrend, metric: Metric, yearIndex: number | null, clientX: number, clientY: number) => void;
  onSelect: (state: StateTrend, metric: Metric) => void;
}

export default function MetricGrid({ data, metric, title, hover, onHover, onSelect }: Props) {
  const sharedYDomain = useMemo(() => computeGlobalYDomain(data.states, metric), [data, metric]);
  // Per-row/column axis gutters used to run down the whole grid, but they
  // were redundant with what the US tile already shows (0, ceiling, start
  // and end year, all inside itself, sized up for its bigger frame) — so
  // the state tiles go back to bare shapes (still on the shared scale, still
  // gridlined at 0/ceiling) and the US tile is the one place that spells
  // the scale out in numbers. The detail view (a state's own zoomed-in
  // chart) keeps its full axis regardless, independent of this grid.
  const yMax = formatYTick(sharedYDomain[1], metric);
  const scaleCaption = metric === "mean" ? `Shared scale: 0–${yMax} µg/m³` : `Shared scale: 0–${yMax} days`;

  return (
    <section className="wst-metric-section">
      <h2 className="wst-metric-title">{title}</h2>
      <p className="wst-metric-subtitle">{scaleCaption}</p>
      {metric === "mean" ? (
        <p className="wst-metric-legend">
          Tile tint: share of 2016–2023 avg. PM2.5 from wildfire smoke —{" "}
          <span className="wst-metric-legend__swatch" style={{ background: "var(--status-critical)" }} aria-hidden />
          ≥15%{" "}
          <span className="wst-metric-legend__swatch" style={{ background: "var(--status-warning)" }} aria-hidden />
          10–15%{" "}
          <span className="wst-metric-legend__swatch wst-metric-legend__swatch--clear" aria-hidden />
          &lt;10%
        </p>
      ) : (
        <p className="wst-metric-legend">
          Tile tint: extra 2016–2022 avg. days/year &gt; 35 µg/m³ from wildfire smoke —{" "}
          <span className="wst-metric-legend__swatch" style={{ background: "var(--status-critical)" }} aria-hidden />
          ≥2{" "}
          <span className="wst-metric-legend__swatch" style={{ background: "var(--status-warning)" }} aria-hidden />
          1–2{" "}
          <span className="wst-metric-legend__swatch wst-metric-legend__swatch--clear" aria-hidden />
          &lt;1
        </p>
      )}
      <div className="wst-grid-scroll">
        <div className="wst-grid">
          {data.states.map((s) => (
            <StateTile
              key={s.abbr}
              state={s}
              metric={metric}
              isSelected={false}
              hoveredYearIndex={hover?.state.abbr === s.abbr && hover.metric === metric ? hover.yearIndex : null}
              sharedYDomain={sharedYDomain}
              onHover={(state, yearIndex, clientX, clientY) => onHover(state, metric, yearIndex, clientX, clientY)}
              onSelect={(state) => onSelect(state, metric)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
