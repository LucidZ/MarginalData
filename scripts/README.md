# Scripts

Data processing and build scripts for MarginalData visualizations.

## Available Scripts

### `generate_i70_crossfilter_data.py`

Builds the data for the Eisenhower Tunnel crossfilter explorer (`/2026/I70Crossfilter`, unlisted):
every hour of traffic through the tunnel by direction, 1996-01-01 to 2026-09-30, joined to daily
NOAA snow/precipitation. Plan: `.claude/i70-tunnel-crossfilter-spec.md`.

**Purpose**: Fetches CDOT OTIS's annual endpoint (one request = one counter-year) for the Tunnel plus
Copper Mountain, Twin Tunnels and Genesee (cached only, for later multi-counter work). OTIS reports
missing hours as `0`, so every Tunnel row with a `0` is re-checked against the per-day endpoint,
which leaves missing hours blank. Weather is GHCN-Daily from Dillon 1 E, falling back to Georgetown
(and Loveland Basin SNOTEL for precip/depth). Computes holidays from the federal rules, per-year
capacity ceilings, saturated hours and likely closures.

**Requirements**: standard library only (no API key). Fetches one request at a time, >= 1 s apart,
with a 10/20/30 s backoff. A full fetch is ~1,900 requests (~35 minutes), most of them Berthoud's per-day zero checks.

**Usage**:
```bash
python scripts/generate_i70_crossfilter_data.py

# Re-run from the data/i70_crossfilter/raw/ cache only
python scripts/generate_i70_crossfilter_data.py --skip-download
```

It prints rows per station x year, missing/incomplete days per year, the per-day zero checks,
weather coverage per year, the per-year ceilings and the flagged closures.

**Output**:
- `public/data/i70-crossfilter/days.json` (columnar, one entry per day; calendar and weather
  fields shared, traffic fields per counter under `counters`)
- `public/data/i70-crossfilter/hours.bin` (Uint16 little-endian, 65535 = missing: for each
  counter in `counters` order, westbound `days x 24` then eastbound)

Three counters go into the page: Twin Tunnels (000120), the Eisenhower Tunnel (000106) and US-40 below Berthoud
Pass (000223). On US-40, OTIS's `S` direction (toward Winter Park) is stored as "wb", the
direction away from Denver. Berthoud's quiet nights mean ~1,500 days have a 0 hour, so a
fresh download makes that many per-day checks (~30 min at 1 request/s).

**When to run**: to extend past 2026-09-30, change `END` and re-run without `--skip-download`.
Cached years are never refetched, so delete the partial year's files first.

### `generate_voter_age_data.py`

Builds the dataset for "The Shape of the Electorate" (`/2026/ShapeOfTheElectorate`): eligible citizens,
registered voters and votes by single year of age (18-100) for every November election
2012-2024.

**Purpose**: Takes population *levels* from the Census Population Estimates Program (PEP) and
*rates* (citizen share, registration, turnout) from the CPS November Voting and Registration
Supplement's Table 1. See the module docstring for why each quantity comes from where it does.

**Requirements**:
- `openpyxl`, plus `xlrd` >= 2 for the 2012/2014 tables, which are legacy `.xls`
  (no API key - these are public downloads from census.gov)

**Usage**:
```bash
python scripts/generate_voter_age_data.py

# Re-run without re-fetching (reuses data/voter_age/ cache)
python scripts/generate_voter_age_data.py --skip-download
```

**Output**:
- File: `public/data/voter-age.json`
- Size: ~195KB

**Known data quirk**: 2018's Table 1 workbook has two sheets, `Table 1` and `Table 1a`
(margins of error), and the *active* sheet is 1a. The script picks the sheet by name and
checks that every year's title starts with `Table 1.`, so a margins-of-error sheet fails
loudly instead of parsing as data.

**When to run**:
- Once to generate the initial dataset
- Re-run if Census revises a published table, or to extend to a new election cycle

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
