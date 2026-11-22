// Google Street View links (plain Maps URLs: no key, no billing) plus the line geometry
// helpers that aim them down the street.
import type { Geometry, Position } from "geojson";

/** Opens Street View at the nearest panorama, facing `heading` when given. */
export function streetViewUrl(lat: number, lng: number, heading: number | null): string {
  const h = heading === null ? "" : `&heading=${Math.round(heading)}`;
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lng.toFixed(6)}${h}`;
}

const M_LAT = 110540;
const M_LON = 111320 * Math.cos((40.015 * Math.PI) / 180);
const xy = ([lon, lat]: Position) => [lon * M_LON, lat * M_LAT];
const metres = (a: Position, b: Position) => {
  const [ax, ay] = xy(a), [bx, by] = xy(b);
  return Math.hypot(ax - bx, ay - by);
};

const lines = (g: Geometry): Position[][] =>
  g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];

/** Compass bearing of the segment nearest to (lat, lng), or null for points. */
export function bearingAt(geom: Geometry, lat: number, lng: number): number | null {
  const [px, py] = xy([lng, lat]);
  let best: number | null = null, bd = Infinity;
  for (const cs of lines(geom))
    for (let i = 1; i < cs.length; i++) {
      const [ax, ay] = xy(cs[i - 1]), [bx, by] = xy(cs[i]), dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
      if (d < bd) {
        bd = d;
        best = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      }
    }
  return best;
}

/** Along-length midpoint of the longest part, as [lat, lng]. */
export function midpoint(geom: Geometry): [number, number] {
  const cs = lines(geom).sort((a, b) => b.length - a.length)[0];
  if (!cs) {
    const c = (geom as { coordinates: Position }).coordinates;
    return [c[1], c[0]];
  }
  const seg = cs.slice(1).map((c, i) => metres(cs[i], c));
  const half = seg.reduce((a, b) => a + b, 0) / 2;
  let acc = 0;
  for (let i = 0; i < seg.length; i++) {
    if (acc + seg[i] >= half) {
      const t = (half - acc) / (seg[i] || 1), a = cs[i], b = cs[i + 1];
      return [a[1] + t * (b[1] - a[1]), a[0] + t * (b[0] - a[0])];
    }
    acc += seg[i];
  }
  return [cs[0][1], cs[0][0]];
}
