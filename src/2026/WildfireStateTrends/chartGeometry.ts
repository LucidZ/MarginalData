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

// Same padding logic (10%, floored at 0) used for both a single state's free
// y-scale and the standardized shared scale below — kept in one place so the
// two modes stay visually consistent when toggled.
function paddedDomain(dataMin: number, dataMax: number): [number, number] {
  const pad = (dataMax - dataMin) * 0.1 || dataMax * 0.1 || 1;
  return [Math.max(0, dataMin - pad), dataMax + pad];
}

// sharedYDomain, when passed, overrides each tile's own free y-scale with one
// fixed domain across every state — the "standardize axes" toggle. Free
// scales (the default) make each state's own shape legible regardless of its
// magnitude, matching the paper's own figures; standardized scales trade
// that away to make magnitude directly comparable across tiles instead.
export function buildScales(
  state: StateTrend,
  metric: Metric,
  frame: ChartFrame,
  sharedYDomain?: [number, number]
) {
  const { observed, counterfactual } = seriesForMetric(state, metric);
  const values = [...observed, ...counterfactual].filter(
    (v): v is number => v !== null && Number.isFinite(v)
  );
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 1;

  // state.years can run further than this metric actually has data — the
  // "mean" metric's EPA-direct extension doesn't cover "extreme days" too,
  // so trim the x domain to years with real data for THIS metric rather
  // than always using the full years array, or the axis stretches into
  // empty space past wherever this metric's data actually ends.
  let lastDataIdx = state.years.length - 1;
  while (lastDataIdx > 0 && observed[lastDataIdx] === null && counterfactual[lastDataIdx] === null) {
    lastDataIdx--;
  }

  const x = scaleLinear()
    .domain([state.years[0], state.years[lastDataIdx]])
    .range([frame.marginLeft, frame.width - frame.marginRight]);

  const y = scaleLinear()
    .domain(sharedYDomain ?? paddedDomain(dataMin, dataMax))
    .range([frame.height - frame.marginBottom, frame.marginTop]);

  return { x, y, dataMin, dataMax };
}

// The shared domain used across every tile when "standardize axes" is on —
// same padding as a single tile's own free scale, just computed over every
// state's total+non-smoke values instead of one state's.
export function computeGlobalYDomain(states: StateTrend[], metric: Metric): [number, number] {
  const allValues = states
    .flatMap((s) => {
      const { observed, counterfactual } = seriesForMetric(s, metric);
      return [...observed, ...counterfactual];
    })
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const dataMin = allValues.length ? Math.min(...allValues) : 0;
  const dataMax = allValues.length ? Math.max(...allValues) : 1;
  return paddedDomain(dataMin, dataMax);
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
