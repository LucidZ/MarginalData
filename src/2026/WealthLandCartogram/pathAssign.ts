import type { WealthGroup } from "./data";

/**
 * A single hand-drawn route through the world's major landmasses, in order.
 * The path itself doesn't need to stay on land — gaps over open ocean (e.g.
 * Canada → Greenland) are fine, since cells are assigned by nearest-point
 * distance, not by walking the path. This is a first draft; easy to reroute.
 */
export const WORLD_PATH: [number, number][] = [
  [-68.3, -54.8], // Tierra del Fuego
  [-72.0, -50.0], // Patagonia
  [-71.5, -38.0], // Central Chile
  [-68.0, -24.0], // NW Argentina / Atacama
  [-65.0, -17.0], // Bolivia
  [-77.0, -9.0], // Peru coast
  [-78.5, 0.0], // Ecuador
  [-75.5, 6.0], // Colombia
  [-79.5, 9.0], // Panama
  [-84.0, 10.0], // Costa Rica
  [-87.0, 13.0], // Nicaragua
  [-90.5, 15.5], // Guatemala
  [-99.0, 19.4], // Mexico City area
  [-101.0, 25.0], // Northern Mexico
  [-99.0, 31.5], // Texas
  [-98.0, 39.0], // Central US
  [-100.0, 50.0], // Central Canada
  [-100.0, 62.0], // Northern Canada
  [-80.0, 68.0], // Baffin Island
  [-45.0, 61.0], // Southern Greenland
  [-42.0, 72.0], // Central Greenland
  [-19.0, 65.0], // Iceland
  [8.5, 61.0], // Norway
  [15.0, 59.0], // Sweden
  [10.0, 51.0], // Germany
  [2.0, 47.0], // France
  [-3.7, 40.4], // Spain
  [-6.0, 33.0], // Morocco
  [2.0, 20.0], // Sahara / Mali
  [8.0, 9.0], // Nigeria
  [18.0, -3.0], // DR Congo
  [25.0, -20.0], // Zimbabwe / Botswana
  [24.0, -33.0], // South Africa
  [35.0, -1.0], // Kenya (heading back up east coast)
  [43.0, 10.0], // Horn of Africa
  [46.0, 25.0], // Saudi Arabia
  [47.0, 34.0], // Iraq / Iran
  [55.0, 45.0], // Kazakhstan
  [70.0, 55.0], // Central Russia
  [90.0, 60.0], // Siberia
  [110.0, 58.0], // Eastern Siberia
  [100.0, 40.0], // Mongolia / China
  [77.0, 20.0], // India
  [101.0, 15.0], // Thailand
  [106.0, 10.0], // Vietnam / Mekong
  [113.0, -1.0], // Borneo
  [140.0, -5.0], // Papua New Guinea
  [135.0, -20.0], // Central / Northern Australia
  [147.0, -37.0], // Southeastern Australia
];

export interface PathData {
  /** land cell indices, sorted ascending by nearest-point arc-length position along WORLD_PATH */
  sortedCells: Int32Array;
  /** pixel-space waypoints, for drawing the guide line */
  pathPixels: [number, number][];
}

/**
 * For every land cell, finds its nearest point along the path (in projected
 * pixel space) and records that point's arc-length position. Sorting cells
 * by this value "unrolls" the whole 2D land mask into one 1D sequence where
 * distance traveled naturally corresponds to less area where land is thin
 * near the path and more area where land is thick — no manual width tuning
 * needed. Computed once (doesn't depend on seeds), reused on every click.
 */
export function buildPathData(
  land: Uint8Array,
  width: number,
  height: number,
  toPixel: (lonLat: [number, number]) => [number, number]
): PathData {
  const pathPixels = WORLD_PATH.map(toPixel);

  // Precompute each segment's geometry once — the naive version recomputed
  // this per LAND CELL (hundreds of thousands of times) instead of per
  // segment (a few dozen), which was the actual bottleneck (~5s of
  // redundant Math.hypot calls). Also compares squared distance in the
  // per-cell search below so no sqrt is needed there at all.
  const segCount = pathPixels.length - 1;
  const segX0 = new Float64Array(segCount);
  const segY0 = new Float64Array(segCount);
  const segDx = new Float64Array(segCount);
  const segDy = new Float64Array(segCount);
  const segLenSq = new Float64Array(segCount);
  const segLen = new Float64Array(segCount);
  const segCumStart = new Float64Array(segCount);
  // padded bounding box per segment, for a cheap early-out below
  const segMinX = new Float64Array(segCount);
  const segMaxX = new Float64Array(segCount);
  const segMinY = new Float64Array(segCount);
  const segMaxY = new Float64Array(segCount);

  let cum = 0;
  for (let s = 0; s < segCount; s++) {
    const [x0, y0] = pathPixels[s];
    const [x1, y1] = pathPixels[s + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    segX0[s] = x0;
    segY0[s] = y0;
    segDx[s] = dx;
    segDy[s] = dy;
    segLenSq[s] = dx * dx + dy * dy;
    segLen[s] = Math.sqrt(segLenSq[s]);
    segCumStart[s] = cum;
    cum += segLen[s];
    segMinX[s] = Math.min(x0, x1);
    segMaxX[s] = Math.max(x0, x1);
    segMinY[s] = Math.min(y0, y1);
    segMaxY[s] = Math.max(y0, y1);
  }

  const landCells: number[] = [];
  const cellPathPos = new Float64Array(width * height);

  for (let i = 0; i < width * height; i++) {
    if (!land[i]) continue;
    landCells.push(i);
    const x = i % width;
    const y = (i / width) | 0;

    let bestSq = Infinity;
    let bestPos = 0;
    for (let s = 0; s < segCount; s++) {
      // cheapest possible distance to this segment's bounding box — if even
      // that can't beat the best found so far, skip the real math entirely
      const bx = x < segMinX[s] ? segMinX[s] - x : x > segMaxX[s] ? x - segMaxX[s] : 0;
      const by = y < segMinY[s] ? segMinY[s] - y : y > segMaxY[s] ? y - segMaxY[s] : 0;
      if (bx * bx + by * by >= bestSq) continue;

      const x0 = segX0[s];
      const y0 = segY0[s];
      const dx = segDx[s];
      const dy = segDy[s];
      const lenSq = segLenSq[s];
      let t = lenSq > 0 ? ((x - x0) * dx + (y - y0) * dy) / lenSq : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      const ddx = x - px;
      const ddy = y - py;
      const dSq = ddx * ddx + ddy * ddy;
      if (dSq < bestSq) {
        bestSq = dSq;
        bestPos = segCumStart[s] + t * segLen[s];
      }
    }
    cellPathPos[i] = bestPos;
  }

  landCells.sort((a, b) => cellPathPos[a] - cellPathPos[b]);
  return { sortedCells: Int32Array.from(landCells), pathPixels };
}

export interface AssignmentResult {
  claimedBy: Int8Array;
  totalLandPixels: number;
  perGroup: { group: WealthGroup; quotaPixels: number; claimedPixels: number }[];
}

/**
 * Pool Adjacent Violators — finds the non-decreasing sequence closest (least
 * squares) to `d`. Used below to find where each region's slice should
 * actually start: each wants to be centered on its own click, but can't
 * overlap its neighbors in path order, so overlapping desires get "pooled"
 * into a shared compromise position (a weighted average), which is exactly
 * the "push each other apart just enough" behavior.
 */
function poolAdjacentViolators(d: number[]): number[] {
  const stack: { value: number; weight: number; count: number }[] = [];
  for (let i = 0; i < d.length; i++) {
    let value = d[i];
    let weight = 1;
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
  for (const block of stack) {
    for (let k = 0; k < block.count; k++) result.push(block.value);
  }
  return result;
}

/**
 * Each placed group gets a contiguous slice of `sortedCells`, sized to its
 * exact wealth-share quota (in pixels — i.e. exact km², unaffected by any
 * of this). Where that slice actually sits is the interesting part: each
 * seed's rank in `sortedCells` (nearest land cell to the click) is treated
 * as a *desired center*, not just a sort key. Regions in path order that
 * don't overlap just sit centered on their own click; regions whose desired
 * ranges collide get pushed apart by the minimum amount needed to fit
 * (solved exactly via isotonic regression, not an approximation).
 *
 * Once every group is placed, quotas always sum to exactly `totalLandPixels`
 * (100% of land), which leaves zero slack — so the complete layout is fully
 * determined by placement order alone, same as a plain cumulative pack from
 * the start. The "click position matters, later clicks push earlier ones
 * around" feel is specifically an *intermediate*-state effect, while slack
 * (unclaimed land) still exists.
 */
export function assignByPath(
  pathData: PathData,
  totalCells: number,
  width: number,
  groups: WealthGroup[],
  seeds: [number, number][],
  toPixel: (lonLat: [number, number]) => [number, number]
): AssignmentResult {
  const { sortedCells } = pathData;
  const n = seeds.length;
  const claimedBy = new Int8Array(totalCells).fill(-1);
  const totalLandPixels = sortedCells.length;

  const anchors = seeds.map(([lon, lat]) => {
    const [px, py] = toPixel([lon, lat]);
    let bestRank = 0;
    let bestD = Infinity;
    for (let r = 0; r < sortedCells.length; r++) {
      const cell = sortedCells[r];
      const cx = cell % width;
      const cy = (cell / width) | 0;
      const dx = cx - px;
      const dy = cy - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        bestRank = r;
      }
    }
    return bestRank;
  });

  const order = seeds.map((_, i) => i).sort((a, b) => anchors[a] - anchors[b]);
  const quotas = groups.slice(0, n).map((g) => Math.round(totalLandPixels * g.wealthShare));
  const lenSorted = order.map((i) => quotas[i]);
  const totalLen = lenSorted.reduce((a, b) => a + b, 0);
  const slack = Math.max(0, totalLandPixels - totalLen);

  // transform desired left-edges so "no overlap" becomes plain monotonicity
  // (see the module doc above) — d[k] is what each slice "wants" once its
  // predecessors' lengths are accounted for
  let cumBefore = 0;
  const d: number[] = [];
  for (let k = 0; k < n; k++) {
    const desiredLeft = anchors[order[k]] - lenSorted[k] / 2;
    d.push(desiredLeft - cumBefore);
    cumBefore += lenSorted[k];
  }

  let y = poolAdjacentViolators(d);
  // clip into the available slack — monotonicity survives clipping since
  // clamp() is itself non-decreasing. At zero slack (all groups placed)
  // every y collapses to 0, forcing the unique zero-gap full-length packing.
  y = y.map((v) => Math.max(0, Math.min(slack, v)));

  cumBefore = 0;
  const startSorted: number[] = [];
  for (let k = 0; k < n; k++) {
    startSorted.push(Math.round(y[k] + cumBefore));
    cumBefore += lenSorted[k];
  }

  const perGroup: AssignmentResult["perGroup"] = new Array(n);
  for (let k = 0; k < n; k++) {
    const gi = order[k];
    const start = Math.max(0, startSorted[k]);
    const end = Math.min(start + quotas[gi], sortedCells.length);
    for (let r = start; r < end; r++) claimedBy[sortedCells[r]] = gi;
    perGroup[gi] = { group: groups[gi], quotaPixels: quotas[gi], claimedPixels: Math.max(0, end - start) };
  }

  return { claimedBy, totalLandPixels, perGroup };
}
