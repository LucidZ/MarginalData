import { scaleLinear } from "d3-scale";
import { line as d3line, curveLinear } from "d3-shape";
import type { Metric, StateTrend } from "./types";

export interface ChartFrame {
  width: number;
  height: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
}

export const TILE_FRAME: ChartFrame = {
  width: 100,
  height: 72,
  marginTop: 14,
  marginRight: 4,
  marginBottom: 4,
  marginLeft: 4,
};

export const DETAIL_FRAME: ChartFrame = {
  width: 640,
  height: 340,
  marginTop: 24,
  marginRight: 24,
  marginBottom: 46,
  marginLeft: 48,
};

export function seriesForMetric(state: StateTrend, metric: Metric) {
  return metric === "mean"
    ? { observed: state.totalPM, counterfactual: state.nonsmokePM }
    : { observed: state.totalExtremePct, counterfactual: state.nonsmokeExtremePct };
}

export function buildScales(state: StateTrend, metric: Metric, frame: ChartFrame) {
  const { observed, counterfactual } = seriesForMetric(state, metric);
  const values = [...observed, ...counterfactual].filter(
    (v): v is number => v !== null && Number.isFinite(v)
  );
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 1;
  const pad = (dataMax - dataMin) * 0.1 || dataMax * 0.1 || 1;

  const x = scaleLinear()
    .domain([state.years[0], state.years[state.years.length - 1]])
    .range([frame.marginLeft, frame.width - frame.marginRight]);

  const y = scaleLinear()
    .domain([Math.max(0, dataMin - pad), dataMax + pad])
    .range([frame.height - frame.marginBottom, frame.marginTop]);

  return { x, y, dataMin, dataMax };
}

export function buildLinePath(
  years: number[],
  values: (number | null)[],
  x: (v: number) => number,
  y: (v: number) => number
): string {
  const points: [number, number][] = [];
  years.forEach((yr, i) => {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) points.push([x(yr), y(v)]);
  });
  const gen = d3line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1])
    .curve(curveLinear);
  return gen(points) ?? "";
}

// Pixel position of a single year's value — used to draw the hover marker.
// Returns null if that year has no data (a gap in the series).
export function pointAt(
  years: number[],
  values: (number | null)[],
  x: (v: number) => number,
  y: (v: number) => number,
  yearIndex: number
): [number, number] | null {
  const v = values[yearIndex];
  if (v === null || !Number.isFinite(v)) return null;
  return [x(years[yearIndex]), y(v)];
}

// Nearest data index to a given x pixel position — used for hover.
export function nearestYearIndex(years: number[], x: (v: number) => number, px: number): number {
  let best = 0;
  let bestDist = Infinity;
  years.forEach((yr, i) => {
    const d = Math.abs(x(yr) - px);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}
