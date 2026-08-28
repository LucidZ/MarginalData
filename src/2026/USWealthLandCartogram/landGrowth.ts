import type { GeoPath } from "d3-geo";
import type { Feature, Geometry } from "geojson";

// The one piece of the original raster-fill approach that survived the
// switch to path-based assignment (see pathAssign.ts) — same role as the
// global version's landGrowth.ts (which this is a direct port of, adapted
// for a single merged outline Feature instead of a FeatureCollection of
// countries). Everything else this file used to contain (BFS ring-growth
// with hard quota stops, then power-weighted Voronoi, then boundary-
// rebalancing between the two, then real-offshore-island filtering) was
// replaced wholesale after a long debugging arc kept running into the real
// US coastline's concave complexity (boxed-in shortfalls, "conduit"
// problems where two regions no longer directly touch) — Voronoi-style
// approaches are fundamentally seed-position-driven and treat exact area as
// something to reverse-engineer after the fact, which fights a non-convex
// real coastline every step of the way. Path-based assignment (sort land by
// position along a fixed route, cut exact quota boundaries) sidesteps all
// of that: exact by construction, always contiguous, no iterative
// correction needed. See the project memory for the full blow-by-blow if
// any of this needs revisiting.

/**
 * Rasterizes the CONUS+DC land mask onto a WxH grid in the given (equal-
 * area) projection. Every "on" cell represents the same real-world area by
 * construction, so area comparisons downstream can just count cells instead
 * of doing spherical-area math.
 */
export function buildLandMask(
  land: Feature<Geometry>,
  path: GeoPath<unknown, d3.GeoPermissibleObjects>,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): Uint8Array {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  path(land);
  ctx.fill();

  const img = ctx.getImageData(0, 0, width, height);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (img.data[i * 4] > 128) mask[i] = 1;
  }
  return keepLargestComponent(mask, width, height);
}

const NEI_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NEI_DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Real offshore islands (San Juan Islands, small Great Lakes/coastal
 *  islands, etc.) can show up in Census-derived boundary data as genuinely
 *  separate landmasses within a state's own MultiPolygon, which survive
 *  into the merged outline. Keeping only the single largest connected
 *  component drops them from the land mask entirely — a rounding error
 *  against 7.8M km² of mainland, not worth the visual noise, and with
 *  path-based assignment keeping them would need the path itself to reach
 *  every island, which it doesn't and shouldn't have to. */
function keepLargestComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let bestStart = -1;
  let bestSize = 0;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    visited[start] = 1;
    let size = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      size++;
      const x = idx % width;
      const y = (idx / width) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + NEI_DX[d];
        const ny = y + NEI_DY[d];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (!mask[nIdx] || visited[nIdx]) continue;
        visited[nIdx] = 1;
        stack[sp++] = nIdx;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestStart = start;
    }
  }

  const out = new Uint8Array(width * height);
  if (bestStart === -1) return out;
  const stack2 = new Int32Array(width * height);
  let sp = 0;
  stack2[sp++] = bestStart;
  out[bestStart] = 1;
  while (sp > 0) {
    const idx = stack2[--sp];
    const x = idx % width;
    const y = (idx / width) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = x + NEI_DX[d];
      const ny = y + NEI_DY[d];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (!mask[nIdx] || out[nIdx]) continue;
      out[nIdx] = 1;
      stack2[sp++] = nIdx;
    }
  }
  return out;
}
