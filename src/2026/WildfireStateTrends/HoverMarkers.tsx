import type { ChartFrame } from "./chartGeometry";
import { pointAt } from "./chartGeometry";

interface Props {
  years: number[];
  observed: (number | null)[];
  counterfactual: (number | null)[];
  x: (v: number) => number;
  y: (v: number) => number;
  yearIndex: number;
  frame: ChartFrame;
  radius: number;
}

// Shared by the tile grid and the detail view — draws a crosshair through the
// hovered year plus a dot on each series at that year, so the tooltip's text
// values have a visible anchor on the chart itself instead of floating free.
export default function HoverMarkers({ years, observed, counterfactual, x, y, yearIndex, frame, radius }: Props) {
  const crossX = x(years[yearIndex]);
  const obsPoint = pointAt(years, observed, x, y, yearIndex);
  const cfPoint = pointAt(years, counterfactual, x, y, yearIndex);
  const haloWidth = Math.max(radius * 0.6, 1);

  return (
    <g pointerEvents="none">
      <line
        x1={crossX}
        x2={crossX}
        y1={frame.marginTop}
        y2={frame.height - frame.marginBottom}
        stroke="var(--baseline)"
        strokeWidth={haloWidth}
      />
      {cfPoint && (
        <circle cx={cfPoint[0]} cy={cfPoint[1]} r={radius} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={haloWidth} />
      )}
      {obsPoint && (
        <circle cx={obsPoint[0]} cy={obsPoint[1]} r={radius} fill="var(--text-primary)" stroke="var(--surface-1)" strokeWidth={haloWidth} />
      )}
    </g>
  );
}
