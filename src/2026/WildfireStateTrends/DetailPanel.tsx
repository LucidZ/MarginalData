import { useLayoutEffect, useRef } from "react";
import type { Metric, StateTrend } from "./types";
import { SMOKE_SHARE_SWATCH, SMOKE_SHARE_WORD } from "./types";
import {
  DETAIL_FRAME,
  buildScales,
  buildLinePath,
  seriesForMetric,
  smokeShare,
  smokeExtremeDays,
  nearestYearIndex,
  referenceYearX,
  SMOKE_SHARE_START_YEAR,
} from "./chartGeometry";
import HoverMarkers from "./HoverMarkers";

interface Props {
  state: StateTrend;
  metric: Metric;
  hoveredYearIndex: number | null;
  onHover: (state: StateTrend, yearIndex: number | null, clientX: number, clientY: number) => void;
  onBack: () => void;
}

export default function DetailPanel({ state, metric, hoveredYearIndex, onHover, onBack }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const frame = DETAIL_FRAME;
  const { x, y } = buildScales(state, metric, frame);
  const { observed, counterfactual } = seriesForMetric(state, metric);

  const observedPath = buildLinePath(state.years, observed, x, y);
  const counterfactualPath = buildLinePath(state.years, counterfactual, x, y);
  // The counterfactual line can stop before the observed line does — its
  // underlying smoke-attribution data has a hard ceiling (currently 2023)
  // that the directly-monitored observed line isn't bound by. Compare each
  // series' own last real year rather than assuming any fixed cutoff, so
  // this stays correct if either data source's coverage changes later.
  const lastRealYear = (series: (number | null)[]) => {
    for (let i = state.years.length - 1; i >= 0; i--) {
      if (series[i] !== null && Number.isFinite(series[i])) return state.years[i];
    }
    return null;
  };
  const observedLastYear = lastRealYear(observed);
  const counterfactualLastYear = lastRealYear(counterfactual);
  const hasGap =
    observedLastYear !== null && counterfactualLastYear !== null && observedLastYear > counterfactualLastYear;

  const xTicks = x.ticks(Math.min(8, state.years.length));
  const yTicks = y.ticks(5);
  const refX = referenceYearX(x, x.domain() as [number, number], SMOKE_SHARE_START_YEAR);

  const share = metric === "mean" ? smokeShare(state) : null;
  const extreme = metric === "extreme" ? smokeExtremeDays(state) : null;
  const badgeColor = SMOKE_SHARE_SWATCH[metric === "mean" ? share!.tier : extreme!.tier];
  const label =
    metric === "mean"
      ? share!.pct !== null
        ? `${Math.round(share!.pct)}% of 2016–2023 avg. PM2.5 from wildfire smoke (${SMOKE_SHARE_WORD[share!.tier]})`
        : "No overlapping smoke data for this state"
      : extreme!.days !== null
        ? `${extreme!.days.toFixed(1)} extra 2016–2022 avg. days/year > 35 µg/m³ from wildfire smoke (${SMOKE_SHARE_WORD[extreme!.tier]})`
        : "No overlapping smoke data for this state";

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

  // Selecting a state deep in the (tall, scrollable) grid leaves the page's
  // scroll position wherever it was — the grid that used to occupy this
  // spot is gone, replaced by this much shorter panel, so that same
  // scrollTop can land past the panel entirely (into the footer, or empty
  // space) with the "All states" button nowhere on screen. Snap the panel
  // to the top of the viewport as it mounts, before paint, so the button
  // and chart are always where the tap that opened them expects to find
  // them — most necessary on mobile, where the grid runs several screens
  // tall. Instant rather than smooth: this is a corrective jump to a
  // sensible starting position, not something the user should watch happen
  // — the view-transition morph already supplies the animated part.
  useLayoutEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [state.abbr, metric]);

  return (
    <div className="wst-detail" ref={rootRef}>
      <button type="button" className="wst-detail__back" onClick={onBack}>
        ← All states
      </button>

      <div className="wst-detail__head">
        <h2>{state.name}</h2>
        {state.region && <span className="wst-detail__region">{state.region.replace(/\s*\(.*\)/, "")}</span>}
      </div>

      <div className="wst-detail__badge">
        <span className="wst-detail__swatch" style={{ background: badgeColor }} aria-hidden />
        {label}
      </div>

      <div className="wst-detail__chart-wrap">
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
            <line
              key={`y-${t}`}
              x1={frame.marginLeft}
              x2={frame.width - frame.marginRight}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
          ))}

          {refX !== null && (
            <line
              x1={refX}
              x2={refX}
              y1={frame.marginTop}
              y2={frame.height - frame.marginBottom}
              stroke="var(--muted)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.5}
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

        {/* Tick labels live outside the SVG's viewBox scaling, as plain CSS
            px positioned by percent — inside it, their font-size would scale
            with the chart's rendered width same as the geometry does, which
            shrinks them past legible on a narrow phone and oversizes them on
            a wide desktop window. Percent-positioned HTML keeps them one
            fixed, readable size at any width (same trick the grid's US tile
            already uses for its own corner labels — see StateTile). */}
        {yTicks.map((t) => (
          <span
            key={`y-${t}`}
            className="wst-detail__tick wst-detail__tick--y"
            style={{
              top: `${(y(t) / frame.height) * 100}%`,
              width: `${((frame.marginLeft - 6) / frame.width) * 100}%`,
            }}
          >
            {t.toFixed(0)}
          </span>
        ))}
        {xTicks.map((t) => (
          <span
            key={`x-${t}`}
            className="wst-detail__tick wst-detail__tick--x"
            style={{
              left: `${(x(t) / frame.width) * 100}%`,
              top: `${((frame.height - frame.marginBottom + 16) / frame.height) * 100}%`,
            }}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="wst-detail__legend">
        <span>
          <span className="wst-detail__swatch" style={{ background: "var(--text-primary)" }} aria-hidden />
          Observed
        </span>
        <span>
          <span className="wst-detail__swatch" style={{ background: "var(--series-1)" }} aria-hidden />
          Counterfactual without smoke
        </span>
      </div>

      {hasGap && (
        <p className="wst-detail__extnote">
          {metric === "mean" ? (
            <>
              Counterfactual line stops at {counterfactualLastYear} — that's as far as the
              underlying smoke-attribution data currently extends. The observed line continues
              through {observedLastYear} using EPA monitoring data directly.
            </>
          ) : (
            <>
              Counterfactual line stops at {counterfactualLastYear} — the non-smoke side of this
              metric hasn't been recomputed past the original study's data yet. The observed line
              continues through {observedLastYear} using our own EPA pull.
            </>
          )}
        </p>
      )}
    </div>
  );
}
