/** One actor in the bounded co-star pool (see scripts/generate_usual_suspects_data.py). */
export interface Actor {
  id: number;
  name: string;
  /** IMDb person id, e.g. "nm0000151" - kept for reference/debugging, not shown in the UI. */
  nconst: string;
  tmdbId: number | null;
  /** TMDB profile_path fragment (e.g. "/abc123.jpg"), or null if no photo was found. Combine with a TMDB image base URL to get a real URL - see photoUrl() in graph.ts. */
  photo: string | null;
}

/** Poster/year/rating ride along in the same TMDB /find response the id comes
 * from, so they cost no extra API calls. All optional: ~0.6% of movies don't
 * match on TMDB at all, and a rating is omitted rather than shipped when too
 * few people voted on it to mean anything. */
export interface Movie {
  id: number;
  title: string;
  tmdbId?: number;
  poster?: string;
  year?: number;
  rating?: number;
}

/** [actorIdA, actorIdB, number of theatrical movies they share, [movieId, ...]] */
export type Edge = [number, number, number, number[]];

export interface GraphData {
  actors: Actor[];
  edges: Edge[];
  movies: Movie[];
  /** Highest shared-film count anywhere in the pool - the frontend draws a fixed 1..N axis from this, so a given x-position always means the same shared-film count for every actor. */
  maxSharedFilms: number;
}
