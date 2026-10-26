import { useMemo, useRef, useState } from "react";
import { area, curveMonotoneX, line, scaleLinear } from "d3";
import type { Direction } from "./types";
import { useContainerWidth } from "./useContainerWidth";
import { fmtCompact, fmtInt, hourLabel } from "./format";

interface Props {
  hero: (number | null)[];
  baseline: (number | null)[];
  dir: Direction;
  hours: [number, number] | null;
  onHours: (h: [number, number] | null) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

// Average vehicles per hour for the matching days, over the all-days curve
// in grey. Doubles as the hour-of-day filter: drag to pick hours.
const HourChart = ({ hero, baseline, dir, hours, onHours }: Props) => {
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
  const max = Math.max(1, ...hero.map((v) => v ?? 0), ...baseline.map((v) => v ?? 0));
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

  const hourAt = (clientX: number, el: SVGSVGElement) => {
    const px = clientX - el.getBoundingClientRect().left - M.left;
    return Math.max(0, Math.min(23, Math.floor(px / step)));
  };
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { anchor: hourAt(e.clientX, e.currentTarget), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const h = hourAt(e.clientX, e.currentTarget);
    setHover(h);
    const d = drag.current;
    if (!d || (h === d.anchor && !d.moved)) return;
    d.moved = true;
    onHours([Math.min(d.anchor, h), Math.max(d.anchor, h)]);
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const h = hourAt(e.clientX, e.currentTarget);
    onHours(hours && hours[0] === h && hours[1] === h ? null : [h, h]);
  };

  const hv = hover != null ? hero[hover] : null;
  const bv = hover != null ? baseline[hover] : null;

  return (
    <div className="i70x-hero-chart" ref={ref}>
      <div className="i70x-readout">
        {hover != null ? (
          <>
            {hourLabel(hover)}-{hourLabel(hover + 1)}: <strong>{hv == null ? "n/a" : fmtInt(hv)}</strong> vehicles
            on matching days vs {bv == null ? "n/a" : fmtInt(bv)} on all days
            {hv != null && bv ? ` (${hv >= bv ? "+" : ""}${Math.round((hv / bv - 1) * 100)}%)` : ""}
          </>
        ) : (
          <>Average vehicles per hour. Drag across the chart to filter by hour of day.</>
        )}
      </div>
      <svg
        width={width}
        height={height}
        className="i70x-hero-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Average vehicles per hour by hour of day, matching days versus all days"
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
          <path d={mkLine(toPts(baseline)) ?? ""} className="i70x-line-base" />
          <path d={mkArea(toPts(hero)) ?? ""} className={`i70x-area ${dir}`} />
          <path d={mkLine(toPts(hero)) ?? ""} className={`i70x-line ${dir}`} />
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y2={innerH} className="i70x-crosshair" />
              {bv != null && <circle cx={x(hover)} cy={y(bv)} r={4} className="i70x-dot-base" />}
              {hv != null && <circle cx={x(hover)} cy={y(hv)} r={4.5} className={`i70x-dot ${dir}`} />}
            </g>
          )}
        </g>
      </svg>
      <div className="i70x-legend">
        <span>
          <i className={`i70x-key ${dir}`} /> Matching days
        </span>
        <span>
          <i className="i70x-key base" /> All days
        </span>
        {hours && (
          <button type="button" className="i70x-clear" onClick={() => onHours(null)}>
            Clear hours ({hourLabel(hours[0])}-{hourLabel(hours[1] + 1)})
          </button>
        )}
      </div>
    </div>
  );
};

export default HourChart;
