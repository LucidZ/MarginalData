import { useMemo, useRef, useState } from "react";
import { scaleBand, scaleLinear } from "d3";
import type { BinSpec, BinValue, Selection } from "./types";
import { useContainerWidth } from "./useContainerWidth";
import { fmtCompact, fmtInt } from "./format";

interface Props {
  spec: BinSpec;
  bins: BinValue[];
  selection: Selection;
  onChange: (sel: Selection) => void;
}

const HEIGHT = 120;
const M = { top: 6, right: 4, bottom: 20, left: 34 };

// Tap a bar to toggle it; drag across bars to select a range.
const BarFilter = ({ spec, bins, selection, onChange }: Props) => {
  const [ref, width] = useContainerWidth<HTMLDivElement>(300);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<{ anchor: number; moved: boolean } | null>(null);

  const innerW = Math.max(width - M.left - M.right, 50);
  const innerH = HEIGHT - M.top - M.bottom;
  const keys = useMemo(() => spec.labels.map((_, k) => k), [spec.labels]);
  const x = useMemo(() => scaleBand<number>().domain(keys).range([0, innerW]).paddingInner(0.15).paddingOuter(0.075), [keys, innerW]);
  const max = Math.max(1, ...bins.map((b) => b.value));
  const y = useMemo(() => scaleLinear().domain([0, max]).nice(3).range([innerH, 0]), [max, innerH]);
  const barW = Math.min(x.bandwidth(), 24);
  const step = x.step();
  // Thin out labels so they don't collide.
  const labelEvery = Math.max(1, Math.ceil(Math.max(...spec.labels.map((l) => l.length)) * 6.5 / step));

  const keyAt = (clientX: number, el: SVGSVGElement) => {
    const px = clientX - el.getBoundingClientRect().left - M.left;
    return Math.max(0, Math.min(keys.length - 1, Math.floor(px / step)));
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const k = keyAt(e.clientX, e.currentTarget);
    drag.current = { anchor: k, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const k = keyAt(e.clientX, e.currentTarget);
    setHover(k);
    const d = drag.current;
    if (!d || (k === d.anchor && !d.moved)) return;
    d.moved = true;
    const [a, b] = [Math.min(d.anchor, k), Math.max(d.anchor, k)];
    onChange(new Set(keys.slice(a, b + 1)));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const k = keyAt(e.clientX, e.currentTarget);
    const next = new Set(selection ?? []);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange(next.size ? next : null);
  };

  const readoutKey = hover ?? null;
  const unit = spec.measure === "avg" ? "vehicles/day" : "days";
  const readout =
    readoutKey != null && bins[readoutKey]
      ? `${spec.labels[readoutKey]}: ${fmtInt(bins[readoutKey].value)} ${unit}` +
        (spec.measure === "avg" ? ` (${fmtInt(bins[readoutKey].days)} days)` : "")
      : spec.measure === "avg"
        ? "Avg vehicles per matching day"
        : "Matching days";

  return (
    <div className="i70x-card" ref={ref}>
      <div className="i70x-card-head">
        <h3>{spec.title}</h3>
        {selection && (
          <button type="button" className="i70x-clear" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
      <div className="i70x-readout">{readout}</div>
      <svg
        width={width}
        height={HEIGHT}
        className="i70x-bars"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${spec.title}: ${unit} per bin. Tap to filter.`}
      >
        <g transform={`translate(${M.left},${M.top})`}>
          {y.ticks(3).map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x2={innerW} className="i70x-grid" />
              <text x={-6} dy="0.32em" textAnchor="end" className="i70x-tick">
                {fmtCompact(t)}
              </text>
            </g>
          ))}
          {keys.map((k) => {
            const b = bins[k];
            const h = innerH - y(b.value);
            const cx = x(k)! + x.bandwidth() / 2;
            const on = !selection || selection.has(k);
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={k}>
                {hover === k && (
                  <rect x={x(k)! - (step - x.bandwidth()) / 2} width={step} height={innerH} className="i70x-hover" />
                )}
                {h > 0 && (
                  <path
                    className={on ? "i70x-bar" : "i70x-bar off"}
                    d={`M${cx - barW / 2},${innerH}V${innerH - h + r}q0,${-r} ${r},${-r}h${barW - 2 * r}q${r},0 ${r},${r}V${innerH}Z`}
                  />
                )}
                {k % labelEvery === 0 && (
                  <text x={cx} y={innerH + 14} textAnchor="middle" className="i70x-tick">
                    {spec.labels[k]}
                  </text>
                )}
              </g>
            );
          })}
          <line x2={innerW} y1={innerH} y2={innerH} className="i70x-baseline" />
        </g>
      </svg>
    </div>
  );
};

export default BarFilter;
