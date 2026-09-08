/** One actor in the bounded co-star pool (see scripts/generate_six_degrees_data.py). */
export interface Actor {
  id: number;
  name: string;
  /** IMDb person id, e.g. "nm0000151" - kept for reference/debugging, not shown in the UI. */
  nconst: string;
  tmdbId: number | null;
  /** TMDB profile_path fragment (e.g. "/abc123.jpg"), or null if no photo was found. Combine with a TMDB image base URL to get a real URL - see photoUrl() in graph.ts. */
  photo: string | null;
}

export interface Movie {
  id: number;
  title: string;
  tconst: string;
  tmdbId: number | null;
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
