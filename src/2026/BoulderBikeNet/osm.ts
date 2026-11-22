// OpenStreetMap links for a spot: the map data comes from OSM, so fixes belong there.
const hash = (lat: number, lng: number) => `#map=19/${lat.toFixed(6)}/${lng.toFixed(6)}`;

/** OSM's "query features": every way at the spot, with the tags that decided its class here (the
 * page has its own Edit button, so the card doesn't need one). */
export function osmQueryUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/query?lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}${hash(lat, lng)}`;
}

/** A note pinned to the spot, for mappers to check; no editing needed. */
export function osmNoteUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/note/new${hash(lat, lng)}`;
}
