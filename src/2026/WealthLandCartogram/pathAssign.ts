import type { WealthGroup } from "./data";

/**
 * A single hand-drawn route through the world's major landmasses, in order.
 * The path itself doesn't need to stay on land — gaps over open ocean (e.g.
 * Canada → Greenland) are fine, since cells are assigned by nearest-point
 * distance, not by walking the path. This is a first draft; easy to reroute.
 */
export const WORLD_PATH: [number, number][] = [
  [-68.3, -54.8], // Tierra del Fuego
  [-69.0, -50.0], // Patagonia (Argentina side)
  [-64.0, -39.0], // Río Negro / northern Patagonia
  [-58.5, -28.0], // Pampas / Mesopotamia (Argentina–Paraguay border)
  [-54.0, -16.0], // Mato Grosso, central Brazil
  [-52.0, -6.0], // southern Amazon (Rondônia–Pará)
  [-65.0, -3.0], // central Amazon basin
  [-75.0, 1.0], // Colombia, Amazon/Andes foothills
  [-78.5, 3.0], // Ecuador
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
  [45.5, 30.0], // Kuwait / southern Iraq
  [48.5, 34.5], // Baghdad, Iraq
  [51.4, 35.7], // Tehran, Iran
  [58.0, 37.5], // Turkmenistan
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
  /** each sortedCells[r]'s arc-length position — parallel array, same order */
  sortedArcPos: Float64Array;
  /** pixel-space waypoints, for drawing the guide line */
  pathPixels: [number, number][];
  /** cumulative arc-length at the start of each pathPixels segment */
  segCumStart: Float64Array;
  /** total length of WORLD_PATH in pixel space */
  totalPathLength: number;
}

/**
 * How much coarser the geodesic-distance grid is than the land mask itself.
 * The Dijkstra below is the expensive part; running it at full resolution
 * (1600x800 = 1.28M nodes) is unnecessary since the source path only has ~50
 * hand-drawn waypoints to begin with — a 2x-downsampled grid (400k nodes) is
 * still far finer than that and keeps the precompute under a second or two.
 */
const GEO_DOWNSAMPLE = 2;

/**
 * Water steps cost this many times more than land steps in the geodesic
 * search below. High enough that the search strongly prefers detouring
 * along a land bridge (e.g. Sinai) over cutting straight across open water
 * between two path segments, but not infinite — islands with no land
 * connection to the path (Japan, Madagascar, the UK, ...) still need to
 * reach *some* source, just at a distance penalty.
 */
const WATER_COST_MULTIPLIER = 4;

/** Minimal binary min-heap over (cost, idx, label) triples, stored as
 * parallel arrays instead of objects — this runs a few hundred thousand
 * times during the Dijkstra search below and per-node allocation showed up
 * as the dominant cost in an earlier object-based version. */
class MinHeap {
  private cost: number[] = [];
  private idx: number[] = [];
  private label: number[] = [];

  get size() {
    return this.cost.length;
  }

  push(cost: number, idx: number, label: number) {
    const { cost: c, idx: ix, label: lb } = this;
    c.push(cost);
    ix.push(idx);
    lb.push(label);
    let i = c.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (c[parent] <= c[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): { cost: number; idx: number; label: number } | undefined {
    const { cost: c, idx: ix, label: lb } = this;
    const n = c.length;
    if (n === 0) return undefined;
    const top = { cost: c[0], idx: ix[0], label: lb[0] };
    const last = n - 1;
    c[0] = c[last];
    ix[0] = ix[last];
    lb[0] = lb[last];
    c.pop();
    ix.pop();
    lb.pop();
    const size = c.length;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let smallest = i;
      if (l < size && c[l] < c[smallest]) smallest = l;
      if (r < size && c[r] < c[smallest]) smallest = r;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
    return top;
  }

  private swap(a: number, b: number) {
    const { cost: c, idx: ix, label: lb } = this;
    [c[a], c[b]] = [c[b], c[a]];
    [ix[a], ix[b]] = [ix[b], ix[a]];
    [lb[a], lb[b]] = [lb[b], lb[a]];
  }
}

/** Downsamples a binary land mask by block-averaging; a block counts as
 * land if at least half its pixels are land. */
function downsampleLand(land: Uint8Array, width: number, height: number, ds: number) {
  const dsWidth = Math.ceil(width / ds);
  const dsHeight = Math.ceil(height / ds);
  const dsLand = new Uint8Array(dsWidth * dsHeight);
  for (let by = 0; by < dsHeight; by++) {
    for (let bx = 0; bx < dsWidth; bx++) {
      let sum = 0;
      let count = 0;
      const yEnd = Math.min(height, (by + 1) * ds);
      const xEnd = Math.min(width, (bx + 1) * ds);
      for (let y = by * ds; y < yEnd; y++) {
        for (let x = bx * ds; x < xEnd; x++) {
          sum += land[y * width + x];
          count++;
        }
      }
      dsLand[by * dsWidth + bx] = count > 0 && sum / count >= 0.5 ? 1 : 0;
    }
  }
  return { dsLand, dsWidth, dsHeight };
}

/**
 * For every land cell, finds its arc-length position along WORLD_PATH by
 * shortest-path (geodesic) distance over the land mask, rather than by
 * straight-line distance in projected pixel space. Sorting cells by this
 * value "unrolls" the whole 2D land mask into one 1D sequence where
 * distance traveled naturally corresponds to less area where land is thin
 * near the path and more area where land is thick — no manual width tuning
 * needed. Computed once (doesn't depend on seeds), reused on every click.
 *
 * Straight-line nearest-point distance (the original approach) has a
 * structural flaw: within one path segment, the projected arc-length is a
 * *linear* function of position along that segment, so any region boundary
 * landing mid-segment shows up as a dead-straight line perpendicular to the
 * segment — cutting across whatever landmass happens to be there (e.g. a
 * ruler-straight seam through Sinai/the Arabian peninsula, unrelated to any
 * real geography). Measuring distance as a walk over land instead makes
 * that boundary bend around actual coastlines and land bridges (Sinai
 * connects Africa to Asia without crossing water, so a Red-Sea-adjacent
 * cell's true "nearest path" distance routes through Suez, not straight
 * across the sea) — the seam becomes geography-shaped instead of ruler-cut.
 *
 * Implemented as a multi-source Dijkstra search from many points resampled
 * along WORLD_PATH, over a downsampled version of the grid (see
 * GEO_DOWNSAMPLE) where land steps are cheap and water steps are expensive
 * but not forbidden (see WATER_COST_MULTIPLIER) — islands with no land
 * connection to the path still resolve to a nearest source, just via a
 * penalized water crossing instead of a free one. Each land cell inherits
 * the arc-length label of whichever source's search wavefront reaches it
 * first — a standard weighted-Voronoi-via-Dijkstra construction.
 */
export function buildPathData(
  land: Uint8Array,
  width: number,
  height: number,
  toPixel: (lonLat: [number, number]) => [number, number]
): PathData {
  const pathPixels = WORLD_PATH.map(toPixel);

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
    const dx = x1 - x0;
    const dy = y1 - y0;
    segX0[s] = x0;
    segY0[s] = y0;
    segDx[s] = dx;
    segDy[s] = dy;
    segLen[s] = Math.sqrt(dx * dx + dy * dy);
    segCumStart[s] = cum;
    cum += segLen[s];
  }
  const totalPathLength = cum;

  const ds = GEO_DOWNSAMPLE;
  const { dsLand, dsWidth, dsHeight } = downsampleLand(land, width, height, ds);

  // Resample WORLD_PATH at a fixed arc-length step (in full-res pixels) so
  // the Dijkstra search below has a dense, even spread of sources to seed
  // from — a source roughly every downsampled cell's width.
  const step = ds;
  const numSamples = Math.max(1, Math.ceil(totalPathLength / step));
  let seg = 0;
  const dsSources: { dsIdx: number; label: number }[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const arcLen = Math.min(totalPathLength, i * step);
    while (seg < segCount - 1 && arcLen >= segCumStart[seg] + segLen[seg]) seg++;
    const t = segLen[seg] > 0 ? (arcLen - segCumStart[seg]) / segLen[seg] : 0;
    const x = segX0[seg] + t * segDx[seg];
    const y = segY0[seg] + t * segDy[seg];
    const bx = Math.max(0, Math.min(dsWidth - 1, Math.floor(x / ds)));
    const by = Math.max(0, Math.min(dsHeight - 1, Math.floor(y / ds)));
    dsSources.push({ dsIdx: by * dsWidth + bx, label: arcLen });
  }

  // Multi-source weighted Dijkstra over the downsampled grid: every source
  // starts at cost 0, and each cell inherits the arc-length label of
  // whichever source's wavefront reaches it first.
  const dsDist = new Float64Array(dsWidth * dsHeight).fill(Infinity);
  const dsLabel = new Float64Array(dsWidth * dsHeight);
  const finalized = new Uint8Array(dsWidth * dsHeight);
  const heap = new MinHeap();
  for (const { dsIdx, label } of dsSources) {
    if (0 < dsDist[dsIdx]) {
      dsDist[dsIdx] = 0;
      heap.push(0, dsIdx, label);
    }
  }

  const NEIGHBOR_DX = [-1, 0, 1, -1, 1, -1, 0, 1];
  const NEIGHBOR_DY = [-1, -1, -1, 0, 0, 1, 1, 1];
  const STEP_COST = [Math.SQRT2, 1, Math.SQRT2, 1, 1, Math.SQRT2, 1, Math.SQRT2];

  while (heap.size > 0) {
    const top = heap.pop()!;
    const { idx } = top;
    if (finalized[idx]) continue;
    finalized[idx] = 1;
    dsLabel[idx] = top.label;

    const x = idx % dsWidth;
    const y = (idx / dsWidth) | 0;
    for (let n = 0; n < 8; n++) {
      const nx = x + NEIGHBOR_DX[n];
      const ny = y + NEIGHBOR_DY[n];
      if (nx < 0 || nx >= dsWidth || ny < 0 || ny >= dsHeight) continue;
      const nIdx = ny * dsWidth + nx;
      if (finalized[nIdx]) continue;
      const weight = dsLand[nIdx] ? 1 : WATER_COST_MULTIPLIER;
      const newDist = top.cost + STEP_COST[n] * weight;
      if (newDist < dsDist[nIdx]) {
        dsDist[nIdx] = newDist;
        heap.push(newDist, nIdx, top.label);
      }
    }
  }

  const landCells: number[] = [];
  const cellPathPos = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (!land[i]) continue;
    landCells.push(i);
    const x = i % width;
    const y = (i / width) | 0;
    const bx = Math.min(dsWidth - 1, Math.floor(x / ds));
    const by = Math.min(dsHeight - 1, Math.floor(y / ds));
    cellPathPos[i] = dsLabel[by * dsWidth + bx];
  }

  landCells.sort((a, b) => cellPathPos[a] - cellPathPos[b]);
  return {
    sortedCells: Int32Array.from(landCells),
    sortedArcPos: Float64Array.from(landCells, (i) => cellPathPos[i]),
    pathPixels,
    segCumStart,
    totalPathLength,
  };
}

/** A region's claim, as a half-open range of ranks into `sortedCells`. */
export interface Range {
  start: number;
  end: number;
}

export interface RangeResult {
  /** indexed by group index; null for groups not yet placed */
  ranges: (Range | null)[];
  /** each seed's nearest-rank anchor, in the same order as `seeds` */
  anchors: number[];
  totalLandPixels: number;
}

/**
 * Pool Adjacent Violators — finds the non-decreasing sequence closest (least
 * squares, weighted) to `d`. Used below to find where each region's slice
 * should actually start: each wants to be centered on its own click, but
 * can't overlap its neighbors in path order, so overlapping desires get
 * "pooled" into a shared compromise position (a weighted average), which is
 * exactly the "push each other apart just enough" behavior.
 *
 * `weights` controls *who* absorbs that compromise. Equal weights (plain
 * least squares) split it evenly by distance — which sounds fair but, when
 * a large brand-new region's desired center conflicts with several small
 * already-settled ones, can drag those small regions a long way from where
 * they'd already visually settled just to average things out, since their
 * combined desired range is narrow compared to the new region's width. A
 * heavily-weighted region barely moves in its own pooled average; see
 * `computeRanges` for why already-placed regions get the higher weight.
 */
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
  for (const block of stack) {
    for (let k = 0; k < block.count; k++) result.push(block.value);
  }
  return result;
}

/**
 * Each placed group gets a contiguous slice of `sortedCells`, sized to its
 * exact wealth-share quota (in pixels — i.e. exact km², unaffected by any
 * of this). Where that slice actually sits is the interesting part: each
 * seed has a *pack anchor* — the freshly-computed nearest-rank-to-click for
 * a group being placed for the first time this round, or its current
 * range's own centroid for a group placed in an earlier round — treated as
 * a *desired center*, not just a sort key. Regions in path order that don't
 * overlap just sit centered on their own pack anchor; regions whose desired
 * ranges collide get pushed apart by the minimum amount needed to fit
 * (solved exactly via isotonic regression, not an approximation).
 *
 * Using an already-placed group's *current centroid* rather than its
 * original click point (which is what its raw `anchors` entry below always
 * is) matters once a group has already been pushed around by an earlier
 * round: ordering against a stale original click can flip a group to the
 * "wrong" side of a new one relative to where it actually visually sits —
 * e.g. clicking just past the boundary of an existing region, meaning to
 * insert between it and its neighbor, but the click's rank landing on the
 * far side of the *neighbor's original anchor* (which may no longer be
 * anywhere near where the neighbor currently is) reshuffles the whole
 * neighborhood instead of just inserting cleanly. Ordering against the
 * neighbor's current centroid instead keeps that comparison meaningful.
 *
 * Once every group is placed, quotas always sum to exactly `totalLandPixels`
 * (100% of land), which leaves zero slack — so the complete layout is fully
 * determined by placement order alone, same as a plain cumulative pack from
 * the start. The "click position matters, later clicks push earlier ones
 * around" feel is specifically an *intermediate*-state effect, while slack
 * (unclaimed land) still exists.
 */
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

  // see the module doc above — a previously-placed group orders and packs
  // against where it currently sits, not where it was first clicked
  const packAnchors = seeds.map((_, i) => {
    const prev = prevRanges[i];
    return prev ? (prev.start + prev.end) / 2 : anchors[i];
  });

  const order = seeds.map((_, i) => i).sort((a, b) => packAnchors[a] - packAnchors[b]);
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
    const desiredLeft = packAnchors[order[k]] - lenSorted[k] / 2;
    d.push(desiredLeft - cumBefore);
    cumBefore += lenSorted[k];
  }

  // An already-placed region resists being pooled away from where it
  // currently sits much more than the group being placed *this* round does
  // — so when a large new region's desired center conflicts with several
  // small settled ones, the newcomer absorbs most of the compromise instead
  // of dragging stable regions a long way from where they'd already
  // visually settled. Doesn't affect the final complete layout (zero slack
  // forces the same unique packing regardless of weight), only how each
  // intermediate click feels.
  const ESTABLISHED_WEIGHT = 20;
  const weights = order.map((i) => (prevRanges[i] ? ESTABLISHED_WEIGHT : 1));
  let y = poolAdjacentViolators(d, weights);
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

  const ranges: (Range | null)[] = new Array(n).fill(null);
  for (let k = 0; k < n; k++) {
    const gi = order[k];
    const start = Math.max(0, startSorted[k]);
    const end = Math.min(start + quotas[gi], sortedCells.length);
    ranges[gi] = { start, end: Math.max(start, end) };
  }

  return { ranges, anchors, totalLandPixels };
}

/**
 * Converts a (possibly fractional, mid-animation) rank into `sortedCells`
 * back to a pixel coordinate. Used for a dot's *final* resting spot — an
 * actual claimed land cell — never for animating its travel (see
 * `pointAtArcLength` for that): two adjacent ranks can be nearly tied on
 * arc-length (e.g. deep inland where the path runs nowhere nearby), and
 * ties are broken by raster scan order, not spatial proximity, so walking
 * through consecutive ranks frame-by-frame can hop around within the
 * landmass rather than glide — the "chaotic jitter" this file's other
 * helper avoids entirely by never touching the raster during travel.
 */
export function rankToPixel(
  pathData: PathData,
  rank: number,
  width: number
): { x: number; y: number } {
  const { sortedCells } = pathData;
  const r = Math.max(0, Math.min(sortedCells.length - 1, Math.round(rank)));
  const cell = sortedCells[r];
  return { x: cell % width, y: (cell / width) | 0 };
}

/** A rank's arc-length position along WORLD_PATH — see `pointAtArcLength`. */
export function rankToArcLength(pathData: PathData, rank: number): number {
  const { sortedArcPos } = pathData;
  const r = Math.max(0, Math.min(sortedArcPos.length - 1, Math.round(rank)));
  return sortedArcPos[r];
}

/**
 * Converts an arc-length position into a pixel by walking WORLD_PATH's own
 * polyline — pure geometric interpolation along a fixed, hand-drawn curve,
 * so it's perfectly smooth and continuous by construction. Used to animate
 * a dot's *travel* between two ranks: interpolate arc-length (not rank)
 * between the from/to positions and look up the point on the path at each
 * frame, so the dot visibly rides the guide line along the actual route
 * instead of jumping between raster cells (see `rankToPixel`'s doc comment
 * for why that would jitter). The dot only leaves the path line to land on
 * its real claimed cell in the settle phase that follows.
 */
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

/**
 * Paints a set of (possibly mid-animation, non-final) ranges onto a
 * claimedBy grid. Separated from `computeRanges` so the same range shape can
 * be rasterized once for the committed state and many times per second for
 * in-between animation frames, without re-solving the pack/push layout.
 */
export function rasterizeRanges(
  pathData: PathData,
  ranges: (Range | null)[],
  totalCells: number
): Int8Array {
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
