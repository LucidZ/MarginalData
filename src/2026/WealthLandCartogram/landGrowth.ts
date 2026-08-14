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
 * Sequentially grows one region per group (in array order — callers should
 * pass groups smallest-wealth-share-first for the bottom-up reveal), BFS-style
 * from each seed, blocked by ocean and already-claimed land. When a region's
 * frontier is fully boxed in before it reaches its quota, it jumps to the
 * nearest remaining unclaimed land pixel (measured from its original seed)
 * and keeps growing — this is how non-contiguous claims happen.
 */
export function growRegions(
  land: Uint8Array,
  width: number,
  height: number,
  groups: WealthGroup[],
  toPixel: (lonLat: [number, number]) => [number, number]
): GrowthResult {
  const idx = (x: number, y: number) => y * width + x;
  const claimedBy = new Int8Array(width * height).fill(-1);

  let totalLandPixels = 0;
  for (let i = 0; i < land.length; i++) if (land[i]) totalLandPixels++;

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

  function growRegion(groupIdx: number, seedLonLat: [number, number], quotaPixels: number): number {
    let [sx, sy] = toPixel(seedLonLat);
    sx = Math.round(sx);
    sy = Math.round(sy);

    if (!(land[idx(sx, sy)] && claimedBy[idx(sx, sy)] === -1)) {
      const snap = nearestUnclaimedLand(sx, sy);
      if (snap === -1) return 0;
      sx = snap % width;
      sy = (snap / width) | 0;
    }

    let claimed = 0;
    let queue = new Int32Array(Math.max(quotaPixels * 4, 64));
    let head = 0;
    let tail = 0;
    queue[tail++] = idx(sx, sy);
    claimedBy[idx(sx, sy)] = groupIdx;
    claimed++;

    while (claimed < quotaPixels) {
      if (head === tail) {
        const jump = nearestUnclaimedLand(sx, sy);
        if (jump === -1) break; // no land left anywhere
        if (tail >= queue.length) {
          const grown = new Int32Array(queue.length * 2);
          grown.set(queue);
          queue = grown;
        }
        claimedBy[jump] = groupIdx;
        claimed++;
        queue[tail++] = jump;
        continue;
      }
      const cur = queue[head++];
      const cx = cur % width;
      const cy = (cur / width) | 0;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = idx(nx, ny);
        if (land[ni] && claimedBy[ni] === -1) {
          claimedBy[ni] = groupIdx;
          claimed++;
          if (tail >= queue.length) {
            const grown = new Int32Array(queue.length * 2);
            grown.set(queue);
            queue = grown;
          }
          queue[tail++] = ni;
          if (claimed >= quotaPixels) break;
        }
      }
    }
    return claimed;
  }

  const perGroup = groups.map((g, i) => {
    const quotaPixels = Math.round(totalLandPixels * g.wealthShare);
    const claimedPixels = growRegion(i, g.seed, quotaPixels);
    return { group: g, quotaPixels, claimedPixels };
  });

  return { claimedBy, totalLandPixels, perGroup };
}
