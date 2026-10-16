#!/usr/bin/env node
// Derives a small "default actors" bundle from the full Usual Suspects
// pool, so the app can render a random default actor instantly - as part of
// the route's own JS chunk, no fetch required - instead of blocking on the
// full ~3MB pool file. The full file still loads in the background for
// search-any-actor; see App.tsx for how the two get merged.
//
// This is a pure derivation from the already-generated pool file, not a
// re-run of the IMDb/TMDB pipeline, so it can't drift from it in content -
// only in *staleness* if pool-a.json regenerates and this doesn't. Re-run
// this whenever `python scripts/generate_usual_suspects_data.py` does.
//
// Usage: node scripts/generate-usual-suspects-defaults.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const SOURCE_PATH = path.join(rootDir, "public/data/usual-suspects-pool-a.json");
const OUT_PATH = path.join(rootDir, "src/2026/UsualSuspects/defaultActors.json");

// How many of the most-connected actors are eligible as a random default.
// Each one pulls in their full real ego-network (every direct costar + the
// movies they share), so this is the main size/variety knob - see the
// script's own printed output for what a given N costs in KB.
const DEFAULT_ACTOR_COUNT = 15;

async function main() {
  const source = JSON.parse(await readFile(SOURCE_PATH, "utf-8"));

  // `actors` arrives pre-sorted by co-star degree (see generate_usual_suspects_data.py),
  // so the first N are the most-connected - always a rich, legible default chart.
  const defaultActorIds = source.actors.slice(0, DEFAULT_ACTOR_COUNT).map((a) => a.id);
  const defaultIdSet = new Set(defaultActorIds);

  const keepActorIds = new Set(defaultActorIds);
  const keepMovieIds = new Set();
  const edges = [];
  for (const edge of source.edges) {
    const [a, b, , movieIds] = edge;
    if (!defaultIdSet.has(a) && !defaultIdSet.has(b)) continue;
    edges.push(edge);
    keepActorIds.add(a);
    keepActorIds.add(b);
    for (const m of movieIds) keepMovieIds.add(m);
  }

  const actors = source.actors.filter((a) => keepActorIds.has(a.id));
  const movies = source.movies.filter((m) => keepMovieIds.has(m.id));

  const bundle = {
    // The subset of `actors` below that are safe to land on directly - the
    // rest are only in here because they're someone's costar, so their own
    // ego-network isn't necessarily complete.
    defaultActorIds,
    actors,
    edges,
    movies,
    maxSharedFilms: source.maxSharedFilms,
  };

  const json = JSON.stringify(bundle);
  await writeFile(OUT_PATH, json);

  console.log(`Wrote ${path.relative(rootDir, OUT_PATH)} (${(json.length / 1024).toFixed(0)} KB)`);
  console.log(
    `  ${defaultActorIds.length} default actors, ${actors.length.toLocaleString()} actors, ` +
      `${edges.length.toLocaleString()} edges, ${movies.length.toLocaleString()} movies`,
  );
}

main();
