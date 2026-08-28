import type { WealthGroup } from "./data";

/**
 * A single straight west→east line at a roughly central latitude (39°N —
 * near the Colorado/Kansas border, close to Washington DC's own latitude),
 * padded well past the real Pacific and Atlantic coastlines at that
 * latitude (actual coast is ~-124.7/-66.9) so no land cell's nearest-point
 * projection clamps to an endpoint and bunches up there. Since this is one
 * monotonic line with no self-proximity anywhere, it structurally can't
 * produce the "two bands pass near each other" fragmentation the earlier
 * three-tier boustrophedon route had (see project memory for that history)
 * — the trade is that boundaries between wealth groups now read as
 * roughly vertical (west/east) bands rather than following any particular
 * geographic logic. No water-crossing here (CONUS is one blob), so unlike
 * WORLD_PATH this doesn't need geodesic/Dijkstra land-distance — straight
 * nearest-point-on-segment distance is sufficient and much cheaper.
 */
export const US_PATH: [number, number][] = [
  [-130, 39], // Pacific Ocean, west of the WA/OR/CA coast
  [-62, 39], // Atlantic Ocean, east of Maine
];

export interface PathData {
  /** land cell indices, sorted ascending by nearest-point arc-length position along US_PATH */
  sortedCells: Int32Array;
  /** each sortedCells[r]'s arc-length position — parallel array, same order */
  sortedArcPos: Float64Array;
  /** pixel-space waypoints, for drawing a guide line if wanted */
  pathPixels: [number, number][];
  /** cumulative arc-length at the start of each pathPixels segment */
  segCumStart: Float64Array;
  totalPathLength: number;
}

const SPLINE_SAMPLES_PER_SEGMENT = 8;

/** Resamples the hand-drawn control points into a smooth Catmull-Rom spline
 *  so region boundaries don't land on visibly sharp corners at waypoints —
 *  same reasoning/implementation as the global version's WORLD_PATH. */
function catmullRomResample(points: [number, number][], samplesPerSegment: number): [number, number][] {
  const n = points.length;
  if (n < 3) return points;
  const at = (i: number): [number, number] => points[Math.max(0, Math.min(n - 1, i))];
  const out: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const steps = i === n - 2 ? samplesPerSegment + 1 : samplesPerSegment;
    for (let s = 0; s < steps; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
      const y = 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
      out.push([x, y]);
    }
  }
  return out;
}

/** For every land cell, finds its arc-length position along US_PATH by
 *  straight-line nearest-point-on-segment distance in projected pixel space
 *  — no geodesic/Dijkstra search needed since CONUS is one contiguous
 *  landmass with no water to route around (the global version needed that
 *  specifically to keep e.g. the Sinai/Red-Sea boundary from cutting a
 *  straight line across open water). Brute-force over all path segments per
 *  cell; cheap enough at this segment count (~280 after spline resampling)
 *  and land-cell count (~500K) to run in well under a second, and it's a
 *  one-time cost independent of seeds/clicks. */
export function buildPathData(
  land: Uint8Array,
  width: number,
  height: number,
  toPixel: (lonLat: [number, number]) => [number, number]
): PathData {
  const pathPixels = catmullRomResample(US_PATH, SPLINE_SAMPLES_PER_SEGMENT).map(toPixel);

  const segCount = pathPixels.length - 1;
  const segX0 = new Float64Array(segCount);
  const segY0 = new Float64Array(segCount);
  const segDx = new Float64Array(segCount);
  const segDy = new Float64Array(segCount);
  const segLen = new Float64Array(segCount);
  const segCumStart = new Float64Array(segCount);

  let cum = 0;
  for (let s = 0; s < segCount; s++) {
    const [x0, y0] = pathPixels[s];
    const [x1, y1] = pathPixels[s + 1];
    const dx = x1 - x0, dy = y1 - y0;
    segX0[s] = x0; segY0[s] = y0; segDx[s] = dx; segDy[s] = dy;
    segLen[s] = Math.sqrt(dx * dx + dy * dy);
    segCumStart[s] = cum;
    cum += segLen[s];
  }
  const totalPathLength = cum;

  const landCells: number[] = [];
  const cellArcPos = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (!land[i]) continue;
    landCells.push(i);
    const px = i % width, py = (i / width) | 0;
    let bestD = Infinity, bestArc = 0;
    for (let s = 0; s < segCount; s++) {
      const len2 = segDx[s] * segDx[s] + segDy[s] * segDy[s];
      let t = len2 > 0 ? ((px - segX0[s]) * segDx[s] + (py - segY0[s]) * segDy[s]) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = segX0[s] + t * segDx[s], cy = segY0[s] + t * segDy[s];
      const dx = px - cx, dy = py - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestArc = segCumStart[s] + t * segLen[s]; }
    }
    cellArcPos[i] = bestArc;
  }

  landCells.sort((a, b) => cellArcPos[a] - cellArcPos[b]);
  return {
    sortedCells: Int32Array.from(landCells),
    sortedArcPos: Float64Array.from(landCells, (i) => cellArcPos[i]),
    pathPixels,
    segCumStart,
    totalPathLength,
  };
}

export interface Range {
  start: number;
  end: number;
}

export interface RangeResult {
  ranges: (Range | null)[];
  anchors: number[];
  totalLandPixels: number;
}

/** Pool Adjacent Violators — see the global version's pathAssign.ts for the
 *  full explanation; ported verbatim, this part doesn't depend on geography
 *  at all, just on ranks. */
function poolAdjacentViolators(d: number[], weights: number[]): number[] {
  const stack: { value: number; weight: number; count: number }[] = [];
  for (let i = 0; i < d.length; i++) {
    let value = d[i];
    let weight = weights[i];
    let count = 1;
    while (stack.length > 0 && stack[stack.length - 1].value > value) {
      const top = stack.pop()!;
      value = (value * weight + top.value * top.weight) / (weight + top.weight);
      weight += top.weight;
      count += top.count;
    }
    stack.push({ value, weight, count });
  }
  const result: number[] = [];
  for (const block of stack) for (let k = 0; k < block.count; k++) result.push(block.value);
  return result;
}

/** Each placed group gets a contiguous slice of `sortedCells`, sized to its
 *  exact wealth-share quota — ported near-verbatim from the global version's
 *  `computeRanges`. See that file for the full reasoning on pack anchors,
 *  established-vs-new weighting, and why zero slack (all groups placed)
 *  forces the same unique packing regardless of click order. */
export function computeRanges(
  pathData: PathData,
  width: number,
  groups: WealthGroup[],
  seeds: [number, number][],
  toPixel: (lonLat: [number, number]) => [number, number],
  prevRanges: (Range | null)[] = []
): RangeResult {
  const { sortedCells } = pathData;
  const n = seeds.length;
  const totalLandPixels = sortedCells.length;

  const anchors = seeds.map(([lon, lat]) => {
    const [px, py] = toPixel([lon, lat]);
    let bestRank = 0, bestD = Infinity;
    for (let r = 0; r < sortedCells.length; r++) {
      const cell = sortedCells[r];
      const cx = cell % width, cy = (cell / width) | 0;
      const dx = cx - px, dy = cy - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestRank = r; }
    }
    return bestRank;
  });

  const packAnchors = seeds.map((_, i) => {
    const prev = prevRanges[i];
    return prev ? (prev.start + prev.end) / 2 : anchors[i];
  });

  const order = seeds.map((_, i) => i).sort((a, b) => packAnchors[a] - packAnchors[b]);
  const quotas = groups.slice(0, n).map((g) => Math.round(totalLandPixels * g.wealthShare));
  const lenSorted = order.map((i) => quotas[i]);
  const totalLen = lenSorted.reduce((a, b) => a + b, 0);
  const slack = Math.max(0, totalLandPixels - totalLen);

  let cumBefore = 0;
  const d: number[] = [];
  for (let k = 0; k < n; k++) {
    const desiredLeft = packAnchors[order[k]] - lenSorted[k] / 2;
    d.push(desiredLeft - cumBefore);
    cumBefore += lenSorted[k];
  }

  const ESTABLISHED_WEIGHT = 20;
  const weights = order.map((i) => (prevRanges[i] ? ESTABLISHED_WEIGHT : 1));
  let y = poolAdjacentViolators(d, weights);
  y = y.map((v) => Math.max(0, Math.min(slack, v)));

  cumBefore = 0;
  const startSorted: number[] = [];
  for (let k = 0; k < n; k++) {
    startSorted.push(Math.round(y[k] + cumBefore));
    cumBefore += lenSorted[k];
  }

  const ranges: (Range | null)[] = new Array(n).fill(null);
  for (let k = 0; k < n; k++) {
    const gi = order[k];
    const start = Math.max(0, startSorted[k]);
    const end = Math.min(start + quotas[gi], sortedCells.length);
    ranges[gi] = { start, end: Math.max(start, end) };
  }

  return { ranges, anchors, totalLandPixels };
}

/** Converts a (possibly fractional, mid-animation) rank into `sortedCells`
 *  back to a pixel coordinate — ported verbatim from the global version.
 *  Used for a dot's *final* resting spot — an actual claimed land cell —
 *  never for animating its travel (see `pointAtArcLength` for that): two
 *  adjacent ranks can be nearly tied on arc-length (e.g. deep inland where
 *  the path runs nowhere nearby), and ties are broken by raster scan order,
 *  not spatial proximity, so walking through consecutive ranks frame-by-
 *  frame can hop around within the landmass rather than glide. */
export function rankToPixel(pathData: PathData, rank: number, width: number): { x: number; y: number } {
  const { sortedCells } = pathData;
  const r = Math.max(0, Math.min(sortedCells.length - 1, Math.round(rank)));
  const cell = sortedCells[r];
  return { x: cell % width, y: (cell / width) | 0 };
}

/** A rank's arc-length position along US_PATH — see `pointAtArcLength`. */
export function rankToArcLength(pathData: PathData, rank: number): number {
  const { sortedArcPos } = pathData;
  const r = Math.max(0, Math.min(sortedArcPos.length - 1, Math.round(rank)));
  return sortedArcPos[r];
}

/** Converts an arc-length position into a pixel by walking US_PATH's own
 *  polyline — pure geometric interpolation along a fixed, hand-drawn curve,
 *  so it's perfectly smooth and continuous by construction. Used to animate
 *  a dot's *travel* between two ranks: interpolate arc-length (not rank)
 *  between the from/to positions and look up the point on the path at each
 *  frame, so the dot visibly rides the guide line along the actual route
 *  instead of jumping between raster cells (see `rankToPixel`'s doc comment
 *  for why that would jitter). The dot only leaves the path line to land on
 *  its real claimed cell in the settle phase that follows. */
export function pointAtArcLength(pathData: PathData, arcLength: number): { x: number; y: number } {
  const { pathPixels, segCumStart, totalPathLength } = pathData;
  const clamped = Math.max(0, Math.min(totalPathLength, arcLength));

  let lo = 0;
  let hi = segCumStart.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segCumStart[mid] <= clamped) lo = mid;
    else hi = mid - 1;
  }
  const s = lo;
  const segStart = segCumStart[s];
  const segEnd = s + 1 < segCumStart.length ? segCumStart[s + 1] : totalPathLength;
  const t = segEnd > segStart ? (clamped - segStart) / (segEnd - segStart) : 0;

  const [x0, y0] = pathPixels[s];
  const [x1, y1] = pathPixels[Math.min(s + 1, pathPixels.length - 1)];
  return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
}

/** Paints a set of ranges onto a claimedBy grid — ported verbatim. */
export function rasterizeRanges(pathData: PathData, ranges: (Range | null)[], totalCells: number): Int8Array {
  const { sortedCells } = pathData;
  const claimedBy = new Int8Array(totalCells).fill(-1);
  ranges.forEach((range, gi) => {
    if (!range) return;
    const start = Math.max(0, Math.round(Math.min(range.start, range.end)));
    const end = Math.min(sortedCells.length, Math.round(Math.max(range.start, range.end)));
    for (let r = start; r < end; r++) claimedBy[sortedCells[r]] = gi;
  });
  return claimedBy;
}
