# Scripts

Data processing and build scripts for MarginalData visualizations.

## Available Scripts

### `generate_usual_suspects_data.py`

Builds the bounded co-star graph for "The Usual Suspects" costar explorer.

**Purpose**: Filters IMDb's non-commercial datasets down to theatrical movies only, then to a
fame-bounded pool of actors (max single-movie `numVotes` AND theatrical credit count, both above
a threshold - see the module docstring for why either signal alone over- or under-includes), then
builds the co-star graph within that pool and enriches each actor with a TMDB photo.

**Requirements**:
- `TMDB_READ_ACCESS_TOKEN` in `.env.local` (TMDB v4 bearer token)
- Raw IMDb datasets auto-download to `data/usual_suspects/imdb/` on first run (~1.3GB, gitignored)

**Usage**:
```bash
# Pool A: ~2,465 actors, anyone in a movie with >=500k votes
python scripts/generate_usual_suspects_data.py --min-votes 500000 --min-movies 1 --out pool-a

# Pool B: ~22,942 actors, a looser fame bar but requires an actual filmography
python scripts/generate_usual_suspects_data.py --min-votes 25000 --min-movies 3 --out pool-b

# Skip TMDB enrichment for faster iteration on the graph-building logic itself
python scripts/generate_usual_suspects_data.py --min-votes 500000 --min-movies 1 --out pool-a --skip-tmdb
```

**Output**:
- File: `public/data/usual-suspects-<out>.json` — `{ actors: [...], edges: [[a, b, weight], ...] }`
- Size: ~250KB (pool-a) to ~4MB (pool-b), gzipped

**When to run**:
- Once to generate the initial dataset
- Re-run with different `--min-votes`/`--min-movies` to resize the actor pool
- Periodically to pick up IMDb's daily dataset refresh (delete `data/usual_suspects/imdb/` first to force a re-download)

### `generate_solar_animation_data.py`

Generates optimized JSON data for the solar animation D3/React visualization.

**Purpose**: Processes CAISO solar generation data for 2024 and creates a JSON file containing:
- Daily total MWh production (for year overview chart)
- 5-minute interval generation data (for daily curve chart)
- Key dates with commentary (solstices, peak/min generation days)

**Requirements**:
- CAISO data must be cached at `data/raw/solar_fuel_mix_2024-01-01_2025-01-01.csv`
- Run the data fetching notebook first if cache doesn't exist

**Usage**:
```bash
python scripts/generate_solar_animation_data.py
```

**Output**:
- File: `public/data/solar_animation_2024.json`
- Size: ~2-3 MB (uncompressed)

**When to run**:
- After fetching new CAISO data
- Before building the React visualization
- When updating key dates or commentary
