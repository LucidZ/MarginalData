// Street-level photo lookup (Mapillary Graph API, one image at a time) plus the line
// geometry helpers it needs. Ported from scripts/boulder_bikenet/build_preview_map.py.
import type { Geometry, Position } from "geojson";

// Mapillary client tokens are meant for browsers (read-only); Vite inlines it into this
// page's chunk. Kept out of git in .env.local.
export const MLY_TOKEN: string = import.meta.env.VITE_MAPILLARY_TOKEN ?? "";

const M_LAT = 110540;
const M_LON = 111320 * Math.cos((40.015 * Math.PI) / 180);
const xy = ([lon, lat]: Position) => [lon * M_LON, lat * M_LAT];
export const angDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
export const metres = (a: Position, b: Position) => {
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

export interface MlyImage {
  id: string;
  captured_at: number;
  is_pano: boolean;
  thumb_1024_url: string;
  creator?: { username?: string };
  at: Position; // [lon, lat] where the photo was taken
  angle: number; // compass direction the camera faces
  d: number; // metres from the clicked spot
}

const FIELDS = "id,captured_at,compass_angle,computed_compass_angle,geometry,computed_geometry,is_pano,thumb_1024_url,creator";

async function fetchWithin(lat: number, lng: number, r: number, signal: AbortSignal): Promise<MlyImage[]> {
  const dLat = r / M_LAT, dLon = r / M_LON;
  const bbox = [lng - dLon, lat - dLat, lng + dLon, lat + dLat].map((v) => v.toFixed(6)).join(",");
  const res = await fetch(
    `https://graph.mapillary.com/images?access_token=${MLY_TOKEN}&fields=${FIELDS}&bbox=${bbox}&limit=500`,
    { signal },
  );
  if (!res.ok) throw new Error(`Mapillary ${res.status}`);
  type Raw = Omit<MlyImage, "at" | "angle" | "d"> & {
    geometry: { coordinates: Position };
    computed_geometry?: { coordinates: Position };
    compass_angle: number;
    computed_compass_angle?: number;
  };
  const here: Position = [lng, lat];
  const data: Raw[] = (await res.json()).data ?? [];
  return data
    .map((m) => {
      const at = (m.computed_geometry ?? m.geometry).coordinates;
      return { ...m, at, angle: m.computed_compass_angle ?? m.compass_angle, d: metres(at, here) };
    })
    .filter((m) => m.d <= r);
}

/** Photos within 25 m, widening to 50 m when there are none. */
export async function findPhotos(lat: number, lng: number, signal: AbortSignal): Promise<MlyImage[]> {
  const near = await fetchWithin(lat, lng, 25, signal);
  return near.length ? near : fetchWithin(lat, lng, 50, signal);
}

export interface Ranked {
  list: MlyImage[];
  want: number | null; // bearing the ranking aimed for
  aligned: (m: MlyImage) => boolean; // flat photo facing `want` (within 40°)
  flipped: boolean;
}

/**
 * Order: flat photos facing the wanted way (most recent first), then 360° panoramas, then the
 * rest. With no street bearing (crash, empty-map click) just most recent first, and "look the
 * other way" aims opposite the first pick. A street has two directions, so on first load it
 * starts with whichever direction has an aligned photo.
 */
export function rankPhotos(imgs: MlyImage[], bearing: number | null, flipped: boolean, first?: MlyImage, auto = false): Ranked {
  let want = bearing;
  if (want !== null && flipped) want = (want + 180) % 360;
  if (want === null && flipped && first) want = (first.angle + 180) % 360;
  const aligned = (m: MlyImage) => want !== null && !m.is_pano && angDiff(m.angle, want) <= 40;
  const tier = (m: MlyImage) => (want === null ? (m.is_pano ? 1 : 0) : m.is_pano ? 1 : aligned(m) ? 0 : 2);
  const list = [...imgs].sort((a, b) => tier(a) - tier(b) || b.captured_at - a.captured_at || a.d - b.d);
  if (auto && bearing !== null && !flipped && list.length && tier(list[0]) !== 0 &&
      imgs.some((m) => !m.is_pano && angDiff(m.angle, bearing) > 140))
    return rankPhotos(imgs, bearing, true, first);
  return { list, want, aligned, flipped };
}
