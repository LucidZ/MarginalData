import { useMemo, useRef, useState } from "react";
import { area, curveMonotoneX, line, scaleLinear } from "d3";
import type { Direction, Series } from "./types";
import { seriesColor } from "./compare";
import { useContainerWidth } from "./useContainerWidth";
import { fmtCompact, fmtInt, hourLabel } from "./format";

interface Props {
  series: Series[];
  /** Key of the series to bring forward (hovered here or in the table). */
  highlight: string | null;
  onHighlight: (key: string | null) => void;
  dir: Direction;
  hours: [number, number] | null;
  onHours: (h: [number, number] | null) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DRAW_ORDER = { faint: 0, ramp: 0, cat: 0, ref: 1, main: 2 } as const;

const pct = (a: number, b: number) => `${a >= b ? "+" : ""}${Math.round((a / b - 1) * 100)}%`;

// Average vehicles per hour by hour of day, one line per series, measured
// against the dashed reference. Doubles as the hour-of-day filter: drag to
// pick hours.
const HourChart = ({ series, highlight, onHighlight, dir, hours, onHours }: Props) => {
  const [ref, width] = useContainerWidth<HTMLDivElement>(900);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<{ anchor: number; moved: boolean } | null>(null);
  const mobile = width < 600;
  const height = mobile ? 220 : 280;
  const M = { top: 12, right: 12, bottom: 24, left: mobile ? 38 : 46 };
  const innerW = Math.max(width - M.left - M.right, 100);
  const innerH = height - M.top - M.bottom;

  const step = innerW / 24;
  const x = (h: number) => (h + 0.5) * step;
  const max = Math.max(1, ...series.flatMap((s) => s.curve.map((v) => v ?? 0)));
  const y = useMemo(() => scaleLinear().domain([0, max]).nice(4).range([innerH, 0]), [max, innerH]);

  const toPts = (vals: (number | null)[]) => HOURS.map((h) => [h, vals[h]] as [number, number | null]);
  const mkLine = line<[number, number | null]>()
    .defined((d) => d[1] != null)
    .x((d) => x(d[0]))
    .y((d) => y(d[1]!))
    .curve(curveMonotoneX);
  const mkArea = area<[number, number | null]>()
    .defined((d) => d[1] != null)
    .x((d) => x(d[0]))
    .y0(innerH)
    .y1((d) => y(d[1]!))
    .curve(curveMonotoneX);

  const refSeries = series.find((s) => s.style === "ref") ?? null;
  const others = series.filter((s) => s.style !== "ref");
  // With many lines, hovering picks the nearest one.
  const pickNearest = others.length > 2;
  const drawn = [...series].sort((a, b) => {
    const ha = a.key === highlight ? 3 : DRAW_ORDER[a.style];
    const hb = b.key === highlight ? 3 : DRAW_ORDER[b.style];
    return ha - hb;
  });

  const local = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left - M.left, e.clientY - r.top - M.top];
  };
  const hourAt = (px: number) => Math.max(0, Math.min(23, Math.floor(px / step)));
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { anchor: hourAt(local(e)[0]), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const [px, py] = local(e);
    const h = hourAt(px);
    setHover(h);
    if (pickNearest) {
      let best: Series | null = null;
      let bestD = Infinity;
      for (const s of others) {
        const v = s.curve[h];
        if (v == null) continue;
        const d = Math.abs(y(v) - py);
        if (d < bestD) (bestD = d), (best = s);
      }
      onHighlight(best?.key ?? null);
    }
    const d = drag.current;
    if (!d || (h === d.anchor && !d.moved)) return;
    d.moved = true;
    onHours([Math.min(d.anchor, h), Math.max(d.anchor, h)]);
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const h = hourAt(local(e)[0]);
    onHours(hours && hours[0] === h && hours[1] === h ? null : [h, h]);
  };
  const onPointerLeave = () => {
    setHover(null);
    if (pickNearest) onHighlight(null);
  };

  // Readout: the hovered (or only) series against the reference.
  const focus = others.find((s) => s.key === highlight) ?? (others.length === 1 ? others[0] : null);
  const readout = () => {
    if (hover == null) return <>Average vehicles per hour. Drag across the chart to filter by hour of day.</>;
    const fv = focus?.curve[hover] ?? null;
    const rv = refSeries?.curve[hover] ?? null;
    return (
      <>
        {hourLabel(hover)}-{hourLabel(hover + 1)}:{" "}
        {focus ? (
          <>
            {focus.label} <strong>{fv == null ? "n/a" : fmtInt(fv)}</strong>
          </>
        ) : (
          "hover a line"
        )}
        {refSeries && (
          <>
            {" "}
            vs {refSeries.label} {rv == null ? "n/a" : fmtInt(rv)}
            {fv != null && rv ? ` (${pct(fv, rv)})` : ""}
          </>
        )}
      </>
    );
  };

  return (
    <div className="i70x-hero-chart" ref={ref}>
      <div className="i70x-readout">{readout()}</div>
      <svg
        width={width}
        height={height}
        className="i70x-hero-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        role="img"
        aria-label={`Average vehicles per hour by hour of day: ${series.map((s) => s.label).join(", ")}`}
      >
        <g transform={`translate(${M.left},${M.top})`}>
          {hours && (
            <rect x={hours[0] * step} width={(hours[1] - hours[0] + 1) * step} height={innerH} className="i70x-brush" />
          )}
          {y.ticks(4).map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x2={innerW} className="i70x-grid" />
              <text x={-6} dy="0.32em" textAnchor="end" className="i70x-tick">
                {fmtCompact(t)}
              </text>
            </g>
          ))}
          <line x2={innerW} y1={innerH} y2={innerH} className="i70x-baseline" />
          {HOURS.filter((h) => h % (mobile ? 6 : 3) === 0).map((h) => (
            <text key={h} x={h * step} y={innerH + 16} textAnchor="middle" className="i70x-tick">
              {hourLabel(h)}
            </text>
          ))}
          {series
            .filter((s) => s.style === "main")
            .map((s) => (
              <path key={`area-${s.key}`} d={mkArea(toPts(s.curve)) ?? ""} className={`i70x-area ${dir}`} />
            ))}
          {drawn.map((s) => {
            const hl = s.key === highlight;
            return (
              <path
                key={s.key}
                d={mkLine(toPts(s.curve)) ?? ""}
                className={`i70x-series ${s.style}${hl ? " hl" : ""}`}
                style={{ stroke: seriesColor(s, dir, hl) }}
              />
            );
          })}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y2={innerH} className="i70x-crosshair" />
              {[refSeries, focus].map((s) => {
                const v = s?.curve[hover];
                return s && v != null ? (
                  <circle
                    key={s.key}
                    cx={x(hover)}
                    cy={y(v)}
                    r={4.5}
                    className="i70x-dot"
                    style={{ fill: seriesColor(s, dir, true) }}
                  />
                ) : null;
              })}
            </g>
          )}
        </g>
      </svg>
      {hours && (
        <div className="i70x-legend">
          <button type="button" className="i70x-clear" onClick={() => onHours(null)}>
            Clear hours ({hourLabel(hours[0])}-{hourLabel(hours[1] + 1)})
          </button>
        </div>
      )}
    </div>
  );
};

export default HourChart;
