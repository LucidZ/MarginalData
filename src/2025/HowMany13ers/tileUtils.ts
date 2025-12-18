// Utilities for working with terrain tiles

export interface TileCoordinate {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

// Colorado bounding box
export const COLORADO_BBOX: BoundingBox = {
  minLon: -109.0448,
  maxLon: -102.0424,
  minLat: 37.0004,
  maxLat: 41.0006,
};

/**
 * Convert latitude to tile Y coordinate at given zoom level
 */
export function lat2tile(lat: number, zoom: number): number {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
}

/**
 * Convert longitude to tile X coordinate at given zoom level
 */
export function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

/**
 * Convert tile coordinates back to lat/lon (for the northwest corner)
 */
export function tile2lon(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

export function tile2lat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Get all tile coordinates that cover a bounding box at a given zoom level
 */
export function getTilesForBoundingBox(
  bbox: BoundingBox,
  zoom: number
): TileCoordinate[] {
  const minX = lon2tile(bbox.minLon, zoom);
  const maxX = lon2tile(bbox.maxLon, zoom);
  const minY = lat2tile(bbox.maxLat, zoom); // Note: Y is inverted
  const maxY = lat2tile(bbox.minLat, zoom);

  const tiles: TileCoordinate[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

/**
 * Generate terrain tile URL for AWS/Mapzen tiles
 */
export function getTerrainTileUrl(x: number, y: number, z: number): string {
  // Using Nextzen terrain tiles (Mapzen format)
  return `https://tile.nextzen.org/tilezen/terrain/v1/512/terrarium/${z}/${x}/${y}.png`;
}
