import { scaleLinear } from "d3-scale";
import { line as d3line, curveLinear } from "d3-shape";
import type { Metric, SmokeShareTier, StateTrend } from "./types";

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
    : { observed: state.totalExtremeDays, counterfactual: state.nonsmokeExtremeDays };
}

// Window for smokeShare's ranking: recent years only, not the full
// 2006-2023 record. A state like WA has calm early-2010s years diluting a
// severe recent run (2018/2020/2021/2023) — averaging the whole span buries
// that in a longer, quieter history and puts WA just below the top cluster.
// Recent-only produces a *stronger* natural gap at the top than the
// full-span version did (3.1 points vs. 1.8), not a weaker one, so this
// isn't a tradeoff made to force WA in — the recent window is just the more
// truthful read of current smoke exposure either way.
export const SMOKE_SHARE_START_YEAR = 2016;

// Boundaries for smokeShare's tier. Plain round numbers rather than gap-fit
// values — an earlier version picked boundaries from gaps in the 48-state
// ranking (6% / 17%), but that made the cutoffs themselves look arbitrary
// even though they were data-derived, and shifted year to year as new data
// comes in. 10% / 15% land in roughly the same place (clear stays a small
// low group, red stays the Northern Plains/Mountain West smoke corridor —
// WA, MN, SD, ID, OR, WY, ND, MT — plus MN, which the gap-based 17% cutoff
// had excluded) while being easy to state and stable across data updates.
const SMOKE_SHARE_CLEAR_MAX = 10;
const SMOKE_SHARE_RED_MIN = 15;

export interface SmokeShare {
  tier: SmokeShareTier;
  pct: number | null; // average % of total PM2.5 attributable to smoke, SMOKE_SHARE_START_YEAR+; null if no year has both series
}

// Our own read of "how much has wildfire smoke affected this state's air,"
// replacing the paper's bootstrap reversal/stagnation classification (see
// SMOKE_GROUP_* history in git log) — that classification was fit once
// against the paper's own 2000-2022 station data and never recomputed
// against this rebuilt 2006-2025 series, so it stopped visually matching
// the line it was tinting. This ranks by smoke's SHARE of total PM2.5 —
// (observed − smoke) / observed, averaged over recent years only (see
// SMOKE_SHARE_START_YEAR) — rather than the raw µg/m³ gap, since share
// reads the same regardless of a state's baseline air quality (a naturally
// hazier state isn't necessarily a smokier one).
export function smokeShare(state: StateTrend): SmokeShare {
  const ratios: number[] = [];
  state.totalPM.forEach((total, i) => {
    const nonsmoke = state.nonsmokePM[i];
    if (total !== null && nonsmoke !== null && total > 0 && state.years[i] >= SMOKE_SHARE_START_YEAR) {
      ratios.push((total - nonsmoke) / total);
    }
  });
  if (ratios.length === 0) return { tier: "clear", pct: null };
  const pct = (ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100;
  const tier: SmokeShareTier = pct >= SMOKE_SHARE_RED_MIN ? "red" : pct >= SMOKE_SHARE_CLEAR_MAX ? "orange" : "clear";
  return { tier, pct };
}

// Boundaries for smokeExtremeDays' tier, in raw days/year rather than a %
// share — unlike the mean-PM metric, most states have close to zero total
// extreme days most years, so a %-of-days ratio is dominated by tiny
// denominators (e.g. a state with 1 total exceedance day and 0 non-smoke
// reads as "100% smoke," from a single data point) rather than a real
// signal. Raw day counts don't have that problem, and this chart's axis is
// already in day units, not %. Same SMOKE_SHARE_START_YEAR recent window as
// the mean-PM tiers, for consistency between the two charts. 1 and 2 pulls
// ND into red alongside CA/WA/MT/OR/ID (ND averages exactly 2.0 extra
// smoke-driven exceedance days/year since 2016) — one step tighter than the
// 1/3 split, which had left ND in orange with NV/UT/WY/CO.
const SMOKE_EXTREME_CLEAR_MAX = 1;
const SMOKE_EXTREME_RED_MIN = 2;

export interface SmokeExtremeDays {
  tier: SmokeShareTier;
  days: number | null; // average extra exceedance-days/year attributable to smoke, SMOKE_SHARE_START_YEAR+; null if no year has both series
}

// Extreme-days counterpart to smokeShare — same idea (our own read, not the
// paper's classification), same "clear/orange/red" tiers, just ranked by
// raw smoke-attributable days/year instead of a % share (see
// SMOKE_EXTREME_CLEAR_MAX for why).
export function smokeExtremeDays(state: StateTrend): SmokeExtremeDays {
  const diffs: number[] = [];
  state.totalExtremeDays.forEach((total, i) => {
    const nonsmoke = state.nonsmokeExtremeDays[i];
    if (total !== null && nonsmoke !== null && state.years[i] >= SMOKE_SHARE_START_YEAR) {
      diffs.push(total - nonsmoke);
    }
  });
  if (diffs.length === 0) return { tier: "clear", days: null };
  const days = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const tier: SmokeShareTier =
    days >= SMOKE_EXTREME_RED_MIN ? "red" : days >= SMOKE_EXTREME_CLEAR_MAX ? "orange" : "clear";
  return { tier, days };
}

// Same padding logic (10% headroom above the max) used for both a single
// state's free y-scale and the standardized shared scale below — kept in one
// place so the two modes stay visually consistent when toggled. Always
// anchored at 0 rather than floored near dataMin: PM2.5 and %-days are both
// physically bounded below by zero, and a fixed zero baseline is what makes
// a line's height honestly readable as its true magnitude (not just its
// wiggle) — this matters most once axis labels are visible on the grid.
function paddedDomain(dataMax: number): [number, number] {
  const pad = dataMax * 0.1 || 1;
  return [0, dataMax + pad];
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
    .domain(sharedYDomain ?? paddedDomain(dataMax))
    .range([frame.height - frame.marginBottom, frame.marginTop]);

  return { x, y, dataMax };
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
  const dataMax = allValues.length ? Math.max(...allValues) : 1;
  return paddedDomain(dataMax);
}

// Terse axis-label formatting shared by the grid's y-axis gutter and the US
// tile's own inside labels — an orienting number, not a precise reading
// (that job belongs to the hover tooltip and the detail view), so whole
// numbers with no unit. Both metrics are plain magnitudes now (µg/m³,
// days) so no per-metric branching is needed, but the metric param stays
// for callers that pass one and for any future metric-specific formatting.
export function formatYTick(v: number, _metric: Metric): string {
  return Math.round(v).toString();
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

// Pixel x-position of the smoke-share window's start year (see
// SMOKE_SHARE_START_YEAR) — the same 2016 cutoff the tile tint and detail
// badge are computed from, drawn as a light dotted line so the charts show
// where that number comes from instead of just asserting it in prose. Null
// when the year falls outside this metric's own x domain (shouldn't happen
// given the data's actual span, but a metric-specific trim could shrink it).
export function referenceYearX(x: (v: number) => number, domain: [number, number], year: number): number | null {
  const [start, end] = domain;
  if (year < start || year > end) return null;
  return x(year);
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
