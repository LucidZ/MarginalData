#!/usr/bin/env python3
"""
Generate The Usual Suspects Co-Star Data

Builds a bounded co-star graph for the "type an actor, see every costar they
have, stacked by films made together" visualization. Two things make the full IMDb actor graph
unshippable as static data: it's ~1.1M actors / ~13M co-appearance pairs
across theatrical movies alone, and the graph is a small-world network
(avg path length ~3.65 - see Watts & Strogatz 1998), so unbounded rings
explode past legibility within 2-3 hops for any well-connected actor.

So this script bounds the actor pool by fame *before* building edges:
  1. Filter IMDb to theatrical movies only (titleType=="movie", non-adult,
     runtime>=40min) - drops tvEpisode/short/video/tvMovie noise.
  2. For each actor, compute (a) the highest numVotes of any single movie
     they're credited in - a "was this person ever in something widely
     watched" proxy - and (b) their theatrical credit count.
  3. Keep only actors clearing --min-votes AND --min-movies. Votes-alone
     over-includes bit-players from one blockbuster ensemble (e.g. minor
     Shawshank Redemption cast); movies-alone over-includes prolific
     unknown character actors. The AND of both is a much better
     "would someone actually type this name" filter than either alone.
  4. Build the actor-actor co-star graph *within that pool only* -
     IMDb caps title.principals at ~10 credited actors/title, so this
     stays a small combinatorial problem even for ensemble films.
  5. Enrich each kept actor with a TMDB profile photo via TMDB's
     find-by-external-id endpoint (IMDb nconst -> TMDB profile_path).
     Photos are hotlinked from image.tmdb.org at runtime, not
     downloaded/stored here - see project_usual_suspects.md for why.

Usage:
    python scripts/generate_usual_suspects_data.py --min-votes 500000 --min-movies 1 --out pool-a
    python scripts/generate_usual_suspects_data.py --min-votes 25000 --min-movies 3 --out pool-b

Requires TMDB_READ_ACCESS_TOKEN in .env.local (v4 bearer token).
"""

import argparse
import csv
import gzip
import http.client
import itertools
import json
import os
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

project_root = Path(__file__).parent.parent
os.chdir(project_root)

RAW_DIR = Path("data/usual_suspects/imdb")
TITLE_BASICS = RAW_DIR / "title.basics.tsv.gz"
TITLE_PRINCIPALS = RAW_DIR / "title.principals.tsv.gz"
TITLE_RATINGS = RAW_DIR / "title.ratings.tsv.gz"
NAME_BASICS = RAW_DIR / "name.basics.tsv.gz"

DATASET_URLS = {
    TITLE_BASICS: "https://datasets.imdbws.com/title.basics.tsv.gz",
    TITLE_PRINCIPALS: "https://datasets.imdbws.com/title.principals.tsv.gz",
    TITLE_RATINGS: "https://datasets.imdbws.com/title.ratings.tsv.gz",
    NAME_BASICS: "https://datasets.imdbws.com/name.basics.tsv.gz",
}

ACTOR_CATEGORIES = {"actor", "actress"}
MIN_RUNTIME_MINUTES = 40


def load_env_local():
    """Minimal .env.local reader - avoids a python-dotenv dependency."""
    env_path = project_root / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def ensure_raw_data():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for path, url in DATASET_URLS.items():
        if path.exists():
            continue
        print(f"Downloading {url} -> {path} ...")
        urllib.request.urlretrieve(url, path)


def tsv_rows(path):
    """Dict-per-row reader, fine for the small files (title.ratings is ~8MB)."""
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        reader = csv.reader(f, delimiter="\t")
        header = next(reader)
        for row in reader:
            yield dict(zip(header, row))


def raw_tsv_lines(path):
    """Bare str.split("\t") reader, no csv module and no dict-per-row -
    the two big files here (title.basics 216MB, title.principals 745MB
    compressed - tens of millions of rows once decompressed) are ~5-10x
    faster this way than csv.reader + dict(zip(...)) per row, since IMDb's
    TSV export never quotes fields or embeds tabs/newlines in them."""
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        header = f.readline().rstrip("\n").split("\t")
        idx = {name: i for i, name in enumerate(header)}
        for line in f:
            yield line.rstrip("\n").split("\t"), idx


def load_theatrical_movie_ids():
    """Returns (movie_ids, movie_titles) - movie_titles covers every theatrical
    movie, not just ones that end up in an edge, since we don't know which
    movies matter until after build_edges runs. Trimmed down to just the
    referenced ones before writing output (see main())."""
    print("Scanning title.basics for theatrical movies...")
    movie_ids = set()
    movie_titles = {}
    n = 0
    for row, idx in raw_tsv_lines(TITLE_BASICS):
        n += 1
        if row[idx["titleType"]] != "movie":
            continue
        if row[idx["isAdult"]] != "0":
            continue
        runtime = row[idx["runtimeMinutes"]]
        if runtime == "\\N" or not runtime.isdigit() or int(runtime) < MIN_RUNTIME_MINUTES:
            continue
        tconst = row[idx["tconst"]]
        movie_ids.add(tconst)
        movie_titles[tconst] = row[idx["primaryTitle"]]
    print(f"  scanned {n:,} titles -> {len(movie_ids):,} theatrical movies")
    return movie_ids, movie_titles


def load_votes():
    print("Loading title.ratings...")
    votes = {}
    for row in tsv_rows(TITLE_RATINGS):
        votes[row["tconst"]] = int(row["numVotes"])
    return votes


def load_cast(movie_ids, votes):
    """Returns cast[tconst] -> [nconst, ...] and per-actor (max_votes, movie_count)."""
    print("Scanning title.principals for actor credits (this is the big one, ~745MB)...")
    cast = defaultdict(list)
    max_votes = defaultdict(int)
    movie_count = defaultdict(int)
    n = 0
    for row, idx in raw_tsv_lines(TITLE_PRINCIPALS):
        n += 1
        if n % 10_000_000 == 0:
            print(f"  ...{n:,} rows scanned")
        if row[idx["category"]] not in ACTOR_CATEGORIES:
            continue
        tconst = row[idx["tconst"]]
        if tconst not in movie_ids:
            continue
        nconst = row[idx["nconst"]]
        cast[tconst].append(nconst)
        v = votes.get(tconst, 0)
        if v > max_votes[nconst]:
            max_votes[nconst] = v
        movie_count[nconst] += 1
    print(f"  scanned {n:,} rows -> {len(movie_count):,} unique actors across {len(cast):,} movies")
    return cast, max_votes, movie_count


def build_pool(max_votes, movie_count, min_votes, min_movies):
    pool = {
        nconst
        for nconst in movie_count
        if max_votes[nconst] >= min_votes and movie_count[nconst] >= min_movies
    }
    print(f"Pool: {len(pool):,} actors (max_votes>={min_votes:,} AND movie_count>={min_movies})")
    return pool


def build_edges(cast, pool):
    """Returns shared_movies[(a, b)] -> [tconst, ...] - which specific movies
    each pair actually costarred in, not just a bare count, so the frontend
    can show real film titles on hover instead of a redundant repeat of the
    weight number the column position already conveys."""
    print("Building co-star edges within the pool...")
    shared_movies = defaultdict(list)
    for tconst, members in cast.items():
        in_pool = [n for n in members if n in pool]
        if len(in_pool) < 2:
            continue
        for a, b in itertools.combinations(sorted(set(in_pool)), 2):
            shared_movies[(a, b)].append(tconst)
    print(f"  {len(shared_movies):,} unique co-star edges")
    return shared_movies


def load_names(pool):
    print("Resolving actor names from name.basics...")
    names = {}
    for row, idx in raw_tsv_lines(NAME_BASICS):
        nconst = row[idx["nconst"]]
        if nconst in pool:
            names[nconst] = row[idx["primaryName"]]
    return names


TMDB_CACHE_PATH = RAW_DIR.parent / "tmdb_cache.json"


def load_tmdb_cache():
    """Keyed by IMDb id (nconst or tconst - never ambiguous, each id is one or
    the other) -> the resolved /find record, or null for a confirmed miss.
    Without this, every regeneration re-resolves the same ~16K ids from
    scratch - this run alone re-fetched actor photos for the 4th time today
    before it ever got to the new poster/year/rating fields."""
    if TMDB_CACHE_PATH.exists():
        return json.loads(TMDB_CACHE_PATH.read_text())
    return {}


def save_tmdb_cache(cache):
    TMDB_CACHE_PATH.write_text(json.dumps(cache))


class TmdbClient:
    """http.client instead of urllib.request specifically for HTTP/1.1
    keep-alive - urllib opens a brand new TCP+TLS connection for every single
    call, and across ~16K calls that handshake overhead (not the API's rate
    limit, which was never the bottleneck) is what made a fresh-cache run take
    over an hour. One persistent connection, reconnecting only on drops."""

    def __init__(self, token):
        self.token = token
        self.conn = None

    def _connect(self):
        if self.conn is not None:
            try:
                self.conn.close()
            except Exception:
                pass
        self.conn = http.client.HTTPSConnection("api.themoviedb.org", timeout=10)

    def find(self, imdb_id, result_key, retries=3):
        path = f"/3/find/{imdb_id}?external_source=imdb_id"
        headers = {"Authorization": f"Bearer {self.token}", "Connection": "keep-alive"}
        for attempt in range(retries):
            try:
                if self.conn is None:
                    self._connect()
                self.conn.request("GET", path, headers=headers)
                resp = self.conn.getresponse()
                body = resp.read()
                if resp.status == 429:
                    time.sleep(1.0)
                    continue
                if resp.status != 200:
                    return None
                results = json.loads(body).get(result_key) or []
                return results[0] if results else None
            except Exception:
                # Server likely closed the idle keep-alive connection - reconnect and retry.
                self._connect()
                time.sleep(0.3)
        return None

    def close(self):
        if self.conn is not None:
            self.conn.close()


def enrich_with_tmdb(pool, token, cache):
    print(f"Enriching {len(pool):,} actors with TMDB photos...")
    client = TmdbClient(token)
    tmdb_data = {}
    hits = 0
    misses = 0
    for i, nconst in enumerate(sorted(pool), 1):
        if nconst in cache:
            person = cache[nconst]
        else:
            person = client.find(nconst, "person_results")
            cache[nconst] = person
            misses += 1
            time.sleep(0.025)  # ~40 req/s, well under the 50 req/s TMDB API limit - only paid on a real cache miss
        if person and person.get("profile_path"):
            hits += 1
        tmdb_data[nconst] = {
            "tmdbId": person.get("id") if person else None,
            "photo": person.get("profile_path") if person else None,
        }
        if i % 200 == 0:
            print(f"  {i:,}/{len(pool):,} ({hits:,} photos found, {misses:,} fresh API calls so far)")
            save_tmdb_cache(cache)
    client.close()
    save_tmdb_cache(cache)
    print(f"  done: {hits:,}/{len(pool):,} actors have a TMDB photo ({misses:,} were fresh calls, rest from cache)")
    return tmdb_data


# A TMDB rating built on a handful of votes is noise, not signal - below this
# we ship no rating rather than an authoritative-looking number derived from
# three people.
MIN_TMDB_VOTES_FOR_RATING = 10


def enrich_movies_with_tmdb(used_tconsts, token, cache):
    """Resolves each referenced movie's TMDB id plus the poster/year/rating
    shown in the detail card. All of this rides along in the same /find
    response we already need for the id, so the poster and rating cost no
    extra API calls - see project_usual_suspects.md."""
    print(f"Enriching {len(used_tconsts):,} movies from TMDB...")
    client = TmdbClient(token)
    info = {}
    hits = 0
    misses = 0
    for i, tconst in enumerate(used_tconsts, 1):
        if tconst in cache:
            movie = cache[tconst]
        else:
            movie = client.find(tconst, "movie_results")
            cache[tconst] = movie
            misses += 1
            time.sleep(0.025)
        if movie:
            hits += 1
            release = movie.get("release_date") or ""
            votes = movie.get("vote_count") or 0
            rating = movie.get("vote_average") or 0
            info[tconst] = {
                "tmdbId": movie.get("id"),
                "poster": movie.get("poster_path"),
                "year": int(release[:4]) if release[:4].isdigit() else None,
                "rating": round(rating, 1) if votes >= MIN_TMDB_VOTES_FOR_RATING and rating > 0 else None,
            }
        if i % 1000 == 0:
            print(f"  {i:,}/{len(used_tconsts):,} ({hits:,} matched, {misses:,} fresh API calls so far)")
            save_tmdb_cache(cache)  # so a kill mid-run (this took 80+ minutes once) doesn't lose all progress
    client.close()
    save_tmdb_cache(cache)
    print(f"  done: {hits:,}/{len(used_tconsts):,} movies matched on TMDB ({misses:,} were fresh calls, rest from cache)")
    return info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-votes", type=int, required=True,
                         help="Min numVotes of the actor's single most-watched movie")
    parser.add_argument("--min-movies", type=int, default=1,
                         help="Min theatrical movie credit count")
    parser.add_argument("--out", required=True, help="Output name, e.g. 'pool-a'")
    parser.add_argument("--skip-tmdb", action="store_true",
                         help="Skip TMDB photo enrichment (faster iteration on graph logic)")
    args = parser.parse_args()

    load_env_local()
    token = os.environ.get("TMDB_READ_ACCESS_TOKEN")
    if not args.skip_tmdb and not token:
        sys.exit("TMDB_READ_ACCESS_TOKEN not set in .env.local (or pass --skip-tmdb)")

    ensure_raw_data()
    tmdb_cache = load_tmdb_cache()
    print(f"TMDB cache: {len(tmdb_cache):,} ids already resolved from a previous run")

    movie_ids, movie_titles = load_theatrical_movie_ids()
    votes = load_votes()
    cast, max_votes, movie_count = load_cast(movie_ids, votes)
    pool = build_pool(max_votes, movie_count, args.min_votes, args.min_movies)
    shared_movies = build_edges(cast, pool)
    names = load_names(pool)

    tmdb_data = enrich_with_tmdb(pool, token, tmdb_cache) if not args.skip_tmdb else {}

    # Compact int IDs, most-connected first (nicer default rendering order)
    degree = defaultdict(int)
    for (a, b), tconsts in shared_movies.items():
        degree[a] += len(tconsts)
        degree[b] += len(tconsts)
    ordered = sorted(pool, key=lambda n: -degree[n])
    id_of = {nconst: i for i, nconst in enumerate(ordered)}

    actors = []
    for nconst in ordered:
        info = tmdb_data.get(nconst, {})
        actors.append({
            "id": id_of[nconst],
            "name": names.get(nconst, "?"),
            "nconst": nconst,
            "tmdbId": info.get("tmdbId"),
            "photo": info.get("photo"),
        })

    # Compact int IDs for movies too, but only the ones actually referenced
    # by an edge - out of ~470K theatrical movies, only a few thousand ever
    # matter to this pool's edges.
    used_tconsts = sorted({t for tconsts in shared_movies.values() for t in tconsts})
    movie_id_of = {tconst: i for i, tconst in enumerate(used_tconsts)}
    movie_info = enrich_movies_with_tmdb(used_tconsts, token, tmdb_cache) if not args.skip_tmdb else {}
    # No `tconst` here on purpose: the frontend never reads it, and at ~13.6K
    # movies the dead string costs more than the poster/year/rating we're
    # adding. It stays available in the raw IMDb files if ever needed.
    movies_out = [
        {
            "id": movie_id_of[t],
            "title": movie_titles.get(t, "?"),
            **{k: v for k, v in (movie_info.get(t) or {}).items() if v is not None},
        }
        for t in used_tconsts
    ]

    edge_list = [
        [id_of[a], id_of[b], len(tconsts), [movie_id_of[t] for t in tconsts]]
        for (a, b), tconsts in shared_movies.items()
    ]
    # The frontend needs this to draw a fixed, dataset-wide film-count axis
    # (same x-position = same shared-film count for every actor, even a
    # blank column where nobody happens to share exactly that count with the
    # current root) rather than a per-actor axis that only shows the counts
    # that particular actor happens to have.
    max_shared_films = max((len(tconsts) for tconsts in shared_movies.values()), default=0)

    out_path = Path("public/data") / f"usual-suspects-{args.out}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(
            {"actors": actors, "edges": edge_list, "movies": movies_out, "maxSharedFilms": max_shared_films},
            f,
            separators=(",", ":"),
        )

    print(f"\nWrote {out_path} ({out_path.stat().st_size / 1024:.0f} KB)")
    print(f"  {len(actors):,} actors, {len(edge_list):,} edges, {len(movies_out):,} referenced movies, "
          f"max shared films = {max_shared_films}")


if __name__ == "__main__":
    main()
