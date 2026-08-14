import type { GeoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";
import type { WealthGroup } from "./data";

const NEIGHBORS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

/**
 * Rasterizes land onto a WxH grid in the given (equal-area) projection.
 * Every "on" cell represents the same real-world area by construction, so
 * region-growing can just count cells instead of doing spherical-area math.
 */
export function buildLandMask(
  land: FeatureCollection,
  path: GeoPath<unknown, d3.GeoPermissibleObjects>,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): Uint8Array {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  land.features.forEach((f) => path(f));
  ctx.fill();

  const img = ctx.getImageData(0, 0, width, height);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (img.data[i * 4] > 128) mask[i] = 1;
  }
  return mask;
}

export interface GrowthResult {
  claimedBy: Int8Array; // -1 unclaimed, else index into groups
  totalLandPixels: number;
  perGroup: { group: WealthGroup; quotaPixels: number; claimedPixels: number }[];
}

/**
 * Grows one region per placed seed **simultaneously** from a shared
 * wavefront (a discretized, capacity-constrained Voronoi tessellation):
 * every active region's frontier expands in lockstep via a single shared BFS
 * queue, so a cell goes to whichever region's wave reaches it first. That
 * keeps every region a compact blob around its own seed — placing a new seed
 * "pushes into" the space between existing regions and reshapes their
 * boundaries, rather than earlier regions permanently freezing whatever they
 * grabbed first and the last one being forced to scatter across leftovers.
 * The whole thing is recomputed from scratch on every call (not resumed from
 * a previous run), which is what lets earlier regions visibly reshape as
 * later seeds join.
 *
 * A region stops accepting new cells once it hits its quota but the shared
 * wave keeps going for everyone else. If a region is fully boxed in by
 * ocean/other regions before reaching quota, it falls back to jumping to the
 * nearest remaining unclaimed land and resuming its own local BFS from
 * there — same non-contiguous escape hatch as before, just now a rare
 * fallback rather than the main mechanism.
 *
 * `seeds` may be shorter than `groups` — only the first `seeds.length` groups
 * are grown, which is what lets the interactive version reveal one region per
 * click instead of requiring all seeds up front.
 */
export function growRegions(
  land: Uint8Array,
  width: number,
  height: number,
  groups: WealthGroup[],
  seeds: [number, number][],
  toPixel: (lonLat: [number, number]) => [number, number]
): GrowthResult {
  const idx = (x: number, y: number) => y * width + x;
  const claimedBy = new Int8Array(width * height).fill(-1);
  const n = seeds.length;

  let totalLandPixels = 0;
  for (let i = 0; i < land.length; i++) if (land[i]) totalLandPixels++;

  const quotas = groups.slice(0, n).map((g) => Math.round(totalLandPixels * g.wealthShare));
  const claimedCount = new Array<number>(n).fill(0);

  function nearestUnclaimedLand(fromX: number, fromY: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(x, y);
        if (land[i] && claimedBy[i] === -1) {
          const dx = x - fromX;
          const dy = y - fromY;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best;
  }

  let queue = new Int32Array(Math.max(totalLandPixels, 64));
  let head = 0;
  let tail = 0;
  function enqueue(cell: number) {
    if (tail >= queue.length) {
      const grown = new Int32Array(queue.length * 2);
      grown.set(queue);
      queue = grown;
    }
    queue[tail++] = cell;
  }
  function drainQueue() {
    while (head < tail) {
      const cur = queue[head++];
      const g = claimedBy[cur];
      if (g < 0 || claimedCount[g] >= quotas[g]) continue;
      const cx = cur % width;
      const cy = (cur / width) | 0;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = idx(nx, ny);
        if (land[ni] && claimedBy[ni] === -1 && claimedCount[g] < quotas[g]) {
          claimedBy[ni] = g;
          claimedCount[g]++;
          enqueue(ni);
        }
      }
    }
  }

  // Phase 1: snap every seed onto unclaimed land, then grow all regions
  // together from a shared wavefront.
  for (let i = 0; i < n; i++) {
    let [sx, sy] = toPixel(seeds[i]);
    sx = Math.round(sx);
    sy = Math.round(sy);
    let start = idx(sx, sy);
    if (!(land[start] && claimedBy[start] === -1)) {
      start = nearestUnclaimedLand(sx, sy);
    }
    if (start !== -1 && quotas[i] > 0) {
      claimedBy[start] = i;
      claimedCount[i] = 1;
      enqueue(start);
    }
  }
  drainQueue();

  // Phase 2: catch-up for any region still short of quota (boxed in before
  // reaching it) — jump to the nearest unclaimed land and keep growing.
  for (let i = 0; i < n; i++) {
    let [sx, sy] = toPixel(seeds[i]);
    sx = Math.round(sx);
    sy = Math.round(sy);
    while (claimedCount[i] < quotas[i]) {
      const jump = nearestUnclaimedLand(sx, sy);
      if (jump === -1) break; // no land left anywhere
      claimedBy[jump] = i;
      claimedCount[i]++;
      enqueue(jump);
      drainQueue();
    }
  }

  const perGroup = seeds.map((_, i) => ({
    group: groups[i],
    quotaPixels: quotas[i],
    claimedPixels: claimedCount[i],
  }));

  return { claimedBy, totalLandPixels, perGroup };
}
