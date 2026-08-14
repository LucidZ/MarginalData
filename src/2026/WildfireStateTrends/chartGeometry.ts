import { scaleLinear, type ScaleLinear } from "d3-scale";
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

export const COMPARE_FRAME: ChartFrame = {
  width: 640,
  height: 360,
  marginTop: 24,
  // extra right margin holds each line's direct end-of-line state label
  marginRight: 34,
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

// Shared x/y scales across several states' observed series — the compare
// view overlays states on one pair of axes, so all lines need one domain
// rather than each state's own free scale (which is what the tile grid and
// single-state detail view use instead).
export function buildMultiScales(states: StateTrend[], metric: Metric, frame: ChartFrame) {
  const allYears = states.flatMap((s) => s.years);
  const yearMin = allYears.length ? Math.min(...allYears) : 2000;
  const yearMax = allYears.length ? Math.max(...allYears) : 2022;

  const allValues = states.flatMap((s) => seriesForMetric(s, metric).observed).filter(
    (v): v is number => v !== null && Number.isFinite(v)
  );
  const dataMin = allValues.length ? Math.min(...allValues) : 0;
  const dataMax = allValues.length ? Math.max(...allValues) : 1;
  const pad = (dataMax - dataMin) * 0.1 || dataMax * 0.1 || 1;

  const x = scaleLinear()
    .domain([yearMin, yearMax])
    .range([frame.marginLeft, frame.width - frame.marginRight]);

  const y = scaleLinear()
    .domain([Math.max(0, dataMin - pad), dataMax + pad])
    .range([frame.height - frame.marginBottom, frame.marginTop]);

  return { x, y, yearMin, yearMax };
}

// Looks up a value by actual year rather than array index — needed for
// compare-view hover, where selected states can have different-length
// years arrays and a shared index would misalign them.
export function valueAtYear(years: number[], values: (number | null)[], year: number): number | null {
  const idx = years.indexOf(year);
  if (idx === -1) return null;
  return values[idx];
}

// Nearest whole year to a given x pixel position, clamped to the domain —
// compare-view hover works in year-space (see valueAtYear) rather than a
// shared array index.
export function nearestYear(x: ScaleLinear<number, number>, px: number, yearMin: number, yearMax: number): number {
  const year = Math.round(x.invert(px));
  return Math.min(yearMax, Math.max(yearMin, year));
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
