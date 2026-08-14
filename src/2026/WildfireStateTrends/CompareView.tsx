import { useRef, useState } from "react";
import type { Metric, StateTrend } from "./types";
import {
  COMPARE_FRAME,
  buildMultiScales,
  buildLinePath,
  seriesForMetric,
  nearestYear,
  valueAtYear,
} from "./chartGeometry";

interface Props {
  states: StateTrend[];
  colors: Record<string, string>;
  metric: Metric;
  onBack: () => void;
  onRemove: (abbr: string) => void;
}

export default function CompareView({ states, colors, metric, onBack, onRemove }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ year: number; clientX: number; clientY: number } | null>(null);
  const frame = COMPARE_FRAME;
  const isPct = metric === "extreme";
  const fmt = (v: number | null) => (v === null ? "—" : isPct ? `${(v * 100).toFixed(1)}%` : `${v.toFixed(1)} µg/m³`);

  const { x, y, yearMin, yearMax } = buildMultiScales(states, metric, frame);
  const xTicks = x.ticks(8);
  const yTicks = y.ticks(5);

  // End-of-line label positions, decluttered — lines that converge near the
  // same value would otherwise stack illegible labels on top of each other.
  // A simple sequential min-gap pass (sort by natural y, then push each
  // label down past the one above it) is enough for the handful of labels
  // this view ever has (capped at MAX_COMPARE states).
  const MIN_LABEL_GAP = 8;
  const endLabels = states
    .map((s) => {
      const { observed } = seriesForMetric(s, metric);
      let lastIdx = -1;
      for (let i = observed.length - 1; i >= 0; i--) {
        if (observed[i] !== null) {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx < 0) return null;
      const rawY = y(observed[lastIdx] as number);
      return { abbr: s.abbr, color: colors[s.abbr], x: x(s.years[lastIdx]) + 3, rawY, adjY: rawY };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => a.rawY - b.rawY);
  endLabels.forEach((label, i) => {
    if (i === 0) return;
    const prev = endLabels[i - 1];
    if (label.adjY - prev.adjY < MIN_LABEL_GAP) label.adjY = prev.adjY + MIN_LABEL_GAP;
  });
  const endLabelByAbbr = Object.fromEntries(endLabels.map((l) => [l.abbr, l]));

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * frame.width;
    const year = nearestYear(x, px, yearMin, yearMax);
    setHover({ year, clientX: e.clientX, clientY: e.clientY });
  }

  // Touch pointers fire pointerleave right after pointerup (see DetailPanel) —
  // only mouse clears on leave, so a tap's readout persists until the next tap.
  function handleLeave(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "touch") return;
    setHover(null);
  }

  const rows =
    hover &&
    states
      .map((s) => ({
        state: s,
        value: valueAtYear(s.years, seriesForMetric(s, metric).observed, hover.year),
      }))
      .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));

  return (
    <div className="wst-detail">
      <button type="button" className="wst-detail__back" onClick={onBack}>
        ← All states
      </button>

      <h2 className="wst-compare__title">Comparing {states.length} states</h2>

      {states.length === 0 ? (
        <p className="wst-compare__empty">Select at least two states from the grid to compare them here.</p>
      ) : (
        <>
          <svg
            ref={svgRef}
            className="wst-detail__svg"
            viewBox={`0 0 ${frame.width} ${frame.height}`}
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
              <text key={`x-${t}`} x={x(t)} y={frame.height - frame.marginBottom + 16} textAnchor="middle" className="wst-detail__tick">
                {t}
              </text>
            ))}

            {hover && (
              <line
                x1={x(hover.year)}
                x2={x(hover.year)}
                y1={frame.marginTop}
                y2={frame.height - frame.marginBottom}
                stroke="var(--baseline)"
                strokeWidth={1}
              />
            )}

            {states.map((s) => {
              const { observed } = seriesForMetric(s, metric);
              const path = buildLinePath(s.years, observed, x, y);
              const color = colors[s.abbr];
              const label = endLabelByAbbr[s.abbr];
              const hoverPoint = hover ? valueAtYear(s.years, observed, hover.year) : null;

              return (
                <g key={s.abbr}>
                  <path d={path} fill="none" stroke={color} strokeWidth={2} />
                  {label && (
                    <text
                      x={label.x}
                      y={label.adjY}
                      dominantBaseline="middle"
                      className="wst-compare__endlabel"
                      fill={color}
                    >
                      {s.abbr}
                    </text>
                  )}
                  {hoverPoint !== null && (
                    <circle cx={x(hover!.year)} cy={y(hoverPoint)} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
                  )}
                </g>
              );
            })}
          </svg>

          {hover && rows && (
            <div
              className="wst-tooltip wst-compare__tooltip"
              style={{
                left: Math.max(8, Math.min(hover.clientX + 14, window.innerWidth - 230)),
                top: hover.clientY + 14 + rows.length * 20 + 40 > window.innerHeight ? Math.max(8, hover.clientY - (rows.length * 20 + 54)) : hover.clientY + 14,
              }}
            >
              <div className="wst-tooltip__head">{hover.year}</div>
              {rows.map(({ state, value }) => (
                <div key={state.abbr}>
                  <span className="wst-tooltip__dot" style={{ background: colors[state.abbr] }} />
                  {state.abbr}: <strong>{fmt(value)}</strong>
                </div>
              ))}
            </div>
          )}

          <div className="wst-compare__legend">
            {states.map((s) => (
              <span key={s.abbr} className="wst-compare__chip">
                <span className="wst-compare__chipdot" style={{ background: colors[s.abbr] }} aria-hidden />
                {s.name}
                <button type="button" aria-label={`Remove ${s.name} from comparison`} onClick={() => onRemove(s.abbr)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
