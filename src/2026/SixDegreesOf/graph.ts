import type { Actor, GraphData, Movie } from "./types";

/** TMDB hotlinks its images off this CDN base rather than us hosting photo bytes ourselves - see project_six_degrees_of.md for why (23K actors x ~15KB/photo is too much to bundle or self-host). */
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w185";

export function photoUrl(actor: Actor): string | null {
  return actor.photo ? `${TMDB_IMAGE_BASE}${actor.photo}` : null;
}

interface AdjacencyEntry {
  id: number;
  weight: number;
  movieIds: number[];
}

export type Adjacency = Map<number, AdjacencyEntry[]>;

/** Each actor's neighbor list (their real direct costars), pre-sorted by shared-movie count descending. */
export function buildAdjacency(data: GraphData): Adjacency {
  const adj: Adjacency = new Map();
  for (const actor of data.actors) adj.set(actor.id, []);
  for (const [a, b, weight, movieIds] of data.edges) {
    adj.get(a)?.push({ id: b, weight, movieIds });
    adj.get(b)?.push({ id: a, weight, movieIds });
  }
  for (const list of adj.values()) list.sort((x, y) => y.weight - x.weight);
  return adj;
}

export interface CostarEntry {
  actor: Actor;
  /** The actual movies they share with the root - resolved once here rather than re-looked-up per render. */
  sharedMovies: Movie[];
}

export interface Bucket {
  /** Number of theatrical movies shared with the root - e.g. 4 means "shares 4 films with the root". */
  sharedFilms: number;
  entries: CostarEntry[];
}

/**
 * Buckets the root's real, complete costar list by how many films they share
 * with the root - nothing capped or curated, everyone the root has ever
 * shared a theatrical movie with (within the pool) is in some bucket.
 * Ascending by sharedFilms, so the axis reads left-to-right like a normal
 * chart (fewer shared films first, closest collaborators on the right).
 */
export function bucketCostars(
  adj: Adjacency,
  actorById: Map<number, Actor>,
  movieById: Map<number, Movie>,
  rootId: number,
): Bucket[] {
  const neighbors = adj.get(rootId) ?? [];
  const byWeight = new Map<number, CostarEntry[]>();
  for (const { id, weight, movieIds } of neighbors) {
    const actor = actorById.get(id);
    if (!actor) continue;
    const sharedMovies = movieIds.map((mid) => movieById.get(mid)).filter((m): m is Movie => m !== undefined);
    if (!byWeight.has(weight)) byWeight.set(weight, []);
    byWeight.get(weight)!.push({ actor, sharedMovies });
  }
  return [...byWeight.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sharedFilms, entries]) => ({ sharedFilms, entries }));
}
