# The Usual Suspects — TMDB full-credits edge supplement (game plan)

Branch: `6-degrees-of` · Script: `scripts/generate_usual_suspects_data.py` · Data: `public/data/usual-suspects-pool-a.json`

This is a plan to execute, written for a fresh context with no memory of the conversation that
produced it. Read this whole file before touching code — the "verified facts" section exists so
you don't have to re-derive numbers that are already confirmed against live data.

## The bug this fixes

Detail cards for costar pairs are missing movies they actually share. Concrete example: **Ed
Helms and Rob Riggle were both in *The Hangover* (2009)**, both actors are in the pool, and *The
Hangover* is referenced elsewhere in the dataset (it's the shared-film edge between Helms and
several other cast members) — but the Helms↔Riggle pair shows no shared films at all, on a pool
that's supposed to be "the root's real, complete costar list ... nothing capped or curated"
(see the docstring on `bucketCostars` in `src/2026/UsualSuspects/graph.ts`).

## Root cause (verified, don't re-derive)

`build_edges()` in the generator script only sources cast membership from IMDb's
`title.principals.tsv.gz`, which **caps at ~10 credited people per title** (mixed cast + crew,
ranked by billing). Pulled the actual row for *The Hangover* (`tt1119646`) from the local file:

```
1  nm0302108  actor    Alan       (Zach Galifianakis)
2  nm0177896  actor    Phil       (Bradley Cooper)
3  nm0058581  actor    Doug       (Justin Bartha)
4  nm1159180  actor    Stu        (Ed Helms)          <- rank 4, makes the cut
5  nm0001287  actress  Jade       (Heather Graham)
6  nm0056936  actress  Tracy      (Sasha Barrese)
7  nm0001787  actor    Sid        (Jeffrey Tambor)
8  nm0421822  actor    Mr. Chow   (Ken Jeong)
9  nm0006713  actress  Melissa    (Rachael Harris)
10 nm0005512  actor    Mike Tyson
11+ director, writers, producers, composer, etc. — no more actor/actress rows
```

Rob Riggle (`nm1443527`, plays "Officer Franklin") never appears in this file for this title at
all — not at a low rank, just absent. `build_edges()` intersects `title.principals` membership
against the pool per movie ([scripts/generate_usual_suspects_data.py:222-236](../scripts/generate_usual_suspects_data.py)),
so a movie with zero recorded row for an actor contributes zero edge for that actor, full stop.

**Confirmed live against the TMDB API** (read-only, already run — no need to repeat this call
just to double check the theory): TMDB's `/person/{id}/movie_credits` *does* carry Riggle's
Hangover credit, past IMDb's cutoff:

```
GET /person/71403/movie_credits   (71403 = Rob Riggle's TMDB person id, already cached
                                    locally at data/usual_suspects/tmdb_cache.json['nm1443527'])
  -> cast includes {'id': 18785, 'title': 'The Hangover', 'character': 'Officer Franklin',
                     'order': 12}
```

`order: 12` — two past IMDb's ~10 cutoff. `id: 18785` is the same TMDB movie id already present
in Ed Helms's own cached credits (`tmdb_cache.json['nm1159180']`) for the same title. So the fix
is real and TMDB's data model actually has the connection; this isn't a dead end.

## The fix: supplement edges from each pool actor's own TMDB credit list

**Do not** try to fetch full cast lists per movie (`/movie/{id}/credits` for every theatrical
title) — that direction of query requires knowing in advance which of the ~470K theatrical
movies might hide an uncredited-in-`title.principals` pool member, which is effectively the
whole theatrical universe. That's the expensive, rejected approach.

Instead, query in the other direction: **for each of the ~2,839 actors already in the pool**,
call `/person/{tmdbId}/movie_credits` (the `tmdbId` is already resolved and cached from the
existing photo-enrichment pass — no new person lookups needed, just a new endpoint per known
id). Build `movie_id -> [nconst, ...]` by grouping the results, then for every movie with ≥2
pool actors, that's an edge (or an addition to an existing edge's movie list).

**Why this can't blow up the actor pool**: the query is always "what movies did this *already-
in-pool* actor appear in," never "who else was cast in this movie." New actors only ever enter
the graph through the second kind of query, which this plan deliberately avoids. The actor
roster is structurally fixed at whatever `build_pool()` already decided — this step can only add
or thicken edges between actors who are already there, and can only add movies that show up on
some existing pool actor's own credit list (bounded, not the full theatrical universe).

### Scale (estimated, not yet run at full size)

| | current pipeline | this addition |
|---|---|---|
| extra API calls | 0 (edges are a pure local-file scan, no network) | ~2,839 (one `movie_credits` call per pool actor, ids already known) |
| at the script's existing ~40 req/s budget | — | ~70s, one-time, cacheable |
| movies referenced | 15,985 (current pool-a) | some growth expected — bounded by "movies any pool actor's own TMDB credits list contains," likely low thousands more, nowhere near 470K |
| actors in pool | 2,839 | unchanged — see above |

## Design decision that needs making before writing code: movie identity

This is the one real wrinkle, flag it up front rather than discovering it mid-implementation.

Today, `shared_movies` and the output `movies[]` are keyed by IMDb `tconst` — TMDB movie ids are
only ever resolved *from* a `tconst` via `/find`, one direction. The new `movie_credits` calls
return **TMDB movie ids directly**, with no `tconst` attached. Two ways to reconcile:

- **Option A (recommended, smaller diff):** for any TMDB movie id discovered this way that
  doesn't already have a known `tconst` (i.e. wasn't already referenced via the IMDb-principals
  path), do one extra reverse lookup — `/movie/{tmdb_id}/external_ids` — to get its `imdb_id`,
  then treat it exactly like every other movie in the pipeline (still keyed by `tconst`
  internally). Extra calls are bounded by the modest new-movie count, not by 2,839.
  Cache these the same incremental way `tmdb_cache.json` already works (new key prefix, e.g.
  `f"ext:{tmdb_movie_id}"`, so a killed run doesn't lose progress — same pattern as
  `enrich_with_tmdb`/`enrich_movies_with_tmdb` already use).
- **Option B (bigger refactor, don't do this first):** drop `tconst` as the movie identity
  entirely and rekey everything on TMDB movie id, since posters/year/rating already come from
  TMDB anyway and the shipped JSON never includes `tconst` (see the comment in `main()`: "No
  `tconst` here on purpose"). Cleaner long-term, but touches `movie_id_of`, `enrich_movies_with_tmdb`,
  and every place that currently assumes `tconst` is the join key. Revisit only if Option A's
  reverse-lookup step turns out to be awkward in practice.

Start with Option A.

## Implementation steps

1. **Prototype small first.** Before running this across all 2,839 actors, confirm end-to-end
   on just Ed Helms (`nm1159180`, TMDB id `27105`) and Rob Riggle (`nm1443527`, TMDB id `71403`):
   pull both actors' `movie_credits`, confirm the intersection surfaces `id: 18785` (The
   Hangover) for both, and confirm the current pipeline's `tconst` for that movie
   (`tt1119646`) is already known in `tmdb_cache.json` — no reverse lookup needed for this
   specific pair, since Hangover is already a referenced movie. This validates the mechanism
   without spending the full API budget.
2. **Add a new enrichment function** (parallel to `enrich_with_tmdb`, same
   `http.client`-keep-alive + incremental-cache-save pattern) that, for every pool actor, calls
   `/person/{tmdbId}/movie_credits` and caches the `cast` array under a new cache key (don't
   collide with the existing `/find`-result cache entries keyed by bare `nconst`/`tconst` —
   prefix this differently, e.g. `f"credits:{nconst}"`).
3. **Build the supplemental index**: `movie_tmdb_id -> [nconst, ...]` from those results,
   restricted to `nconst`s already in `pool` (the credits call can mention movies alongside
   *other* cast who aren't in the pool — ignore those, only pool-to-pool pairs matter).
4. **Resolve movie identity** per the Option A plan: for each TMDB movie id in that index,
   check whether it's already resolvable to a known `tconst` (cross-reference the existing
   `tmdb_cache.json` movie entries by TMDB id — build a reverse map once). If not found, do the
   `/movie/{id}/external_ids` call, cache it, and use the returned `imdb_id` as `tconst` going
   forward. Skip (log, don't crash) any movie TMDB has no `imdb_id` for.
5. **Merge into `shared_movies`**: for every pool-actor pair that co-occurs in this supplemental
   index on some `tconst`, union that `tconst` into the pair's existing movie list (or create a
   new entry if the pair had no edge before). Reuse the existing `itertools.combinations` shape
   so downstream code (`degree`, `movie_id_of`, `edge_list` construction) doesn't need to change.
6. **Re-run `enrich_movies_with_tmdb`** — it already only enriches `used_tconsts` that end up
   referenced, so newly-added movies get poster/year/rating for free via the existing code path,
   no special-casing needed there.
7. **Regenerate `public/data/usual-suspects-pool-a.json`**, diff actor/edge/movie counts against
   the current file (2,839 actors / 82,812 edges / 15,985 movies) to confirm actors stayed flat
   and edges/movies grew by a sane, bounded amount — if actor count moved at all, something in
   step 3's pool-membership filter is wrong, stop and investigate before shipping.
8. **Spot-check specific pairs**, starting with Helms↔Riggle (should now show *The Hangover*,
   and probably *The Hangover Part II*/*III* if Riggle appears in those too — check), plus 2-3
   other pairs known to involve background/cameo roles, to build confidence beyond the one
   verified case.
9. **Playwright verification** per [[feedback_playwright_testing]] — reuse the existing
   `tests/usual-suspects.spec.ts` scaffold, don't hand-roll new scroll/interaction helpers. Note
   the existing suite's known landmine: **actor ids are positional and move on every
   regeneration** (see `project_usual_suspects` memory) — any hardcoded id in the test file will
   need updating, and the `?actor=nconst` URL scheme (already fixed to be stable) is the right
   thing to assert against, not numeric ids.
10. **Don't deploy yet.** This is still on `6-degrees-of`, unmerged. Regenerating the data file
    is enough to validate the fix; merging/shipping is a separate decision the user hasn't
    made yet.

## Open questions to flag back to the user, not decide unilaterally

- Whether to also regenerate a `pool-b` variant (mentioned in the script's usage docstring but
  not currently shipped — only `pool-a.json` exists in `public/data/`) with this same fix, or
  leave that for later.
- Whether TMDB's own credit lists might *also* have gaps for sufficiently obscure cameos (they're
  fuller than IMDb's 10-cap but not necessarily exhaustive) — worth setting expectations that
  this narrows the gap, doesn't provably close it to zero.
