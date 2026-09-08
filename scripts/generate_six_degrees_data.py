#!/usr/bin/env python3
"""
Generate Six Degrees Of... Network Data

Builds a bounded co-star graph for the "type an actor, watch the rings of
costars expand" visualization. Two things make the full IMDb actor graph
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
     downloaded/stored here - see project_six_degrees_of.md for why.

Usage:
    python scripts/generate_six_degrees_data.py --min-votes 500000 --min-movies 1 --out pool-a
    python scripts/generate_six_degrees_data.py --min-votes 25000 --min-movies 3 --out pool-b

Requires TMDB_READ_ACCESS_TOKEN in .env.local (v4 bearer token).
"""

import argparse
import csv
import gzip
import itertools
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

project_root = Path(__file__).parent.parent
os.chdir(project_root)

RAW_DIR = Path("data/six_degrees/imdb")
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


def tmdb_find(imdb_id, token, result_key, retries=3):
    """Shared by actor and movie lookups - TMDB's /find endpoint resolves any
    IMDb id (person or title) to the matching TMDB record via result_key
    ("person_results" or "movie_results")."""
    url = f"https://api.themoviedb.org/3/find/{imdb_id}?external_source=imdb_id"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            results = data.get(result_key) or []
            return results[0] if results else None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(1.0)
                continue
            return None
        except Exception:
            time.sleep(0.5)
    return None


def enrich_with_tmdb(pool, token):
    print(f"Enriching {len(pool):,} actors with TMDB photos (~{len(pool)/40:.0f}s at 40 req/s)...")
    tmdb_data = {}
    hits = 0
    for i, nconst in enumerate(sorted(pool), 1):
        person = tmdb_find(nconst, token, "person_results")
        if person and person.get("profile_path"):
            hits += 1
        tmdb_data[nconst] = {
            "tmdbId": person.get("id") if person else None,
            "photo": person.get("profile_path") if person else None,
        }
        if i % 200 == 0:
            print(f"  {i:,}/{len(pool):,} ({hits:,} photos found so far)")
        time.sleep(0.025)  # ~40 req/s, well under the 50 req/s TMDB API limit
    print(f"  done: {hits:,}/{len(pool):,} actors have a TMDB photo")
    return tmdb_data


def enrich_movies_with_tmdb(used_tconsts, token):
    """Resolves each referenced movie's TMDB id, for linking to
    themoviedb.org/movie/{id} in the hover tooltip - see project_six_degrees_of.md
    for why TMDB (not a streaming/affiliate link) is the default here."""
    print(f"Enriching {len(used_tconsts):,} movies with TMDB ids (~{len(used_tconsts)/40:.0f}s at 40 req/s)...")
    tmdb_ids = {}
    hits = 0
    for i, tconst in enumerate(used_tconsts, 1):
        movie = tmdb_find(tconst, token, "movie_results")
        if movie:
            hits += 1
            tmdb_ids[tconst] = movie.get("id")
        if i % 1000 == 0:
            print(f"  {i:,}/{len(used_tconsts):,} ({hits:,} matched so far)")
        time.sleep(0.025)
    print(f"  done: {hits:,}/{len(used_tconsts):,} movies matched on TMDB")
    return tmdb_ids


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

    movie_ids, movie_titles = load_theatrical_movie_ids()
    votes = load_votes()
    cast, max_votes, movie_count = load_cast(movie_ids, votes)
    pool = build_pool(max_votes, movie_count, args.min_votes, args.min_movies)
    shared_movies = build_edges(cast, pool)
    names = load_names(pool)

    tmdb_data = enrich_with_tmdb(pool, token) if not args.skip_tmdb else {}

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
    movie_tmdb_ids = enrich_movies_with_tmdb(used_tconsts, token) if not args.skip_tmdb else {}
    movies_out = [
        {
            "id": movie_id_of[t],
            "title": movie_titles.get(t, "?"),
            "tconst": t,
            "tmdbId": movie_tmdb_ids.get(t),
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

    out_path = Path("public/data") / f"six-degrees-{args.out}.json"
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
