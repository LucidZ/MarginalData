import type { GeoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";

/**
 * Rasterizes land onto a WxH grid in the given (equal-area) projection.
 * Every "on" cell represents the same real-world area by construction, so
 * area comparisons downstream can just count cells instead of doing
 * spherical-area math.
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
