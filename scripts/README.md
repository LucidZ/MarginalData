# Scripts

Data processing and build scripts for MarginalData visualizations.

## Available Scripts

### `generate_i70_traffic_data.py`

Builds the dataset for the I-70 mountain traffic toy (`/2026/I70Traffic`, proof of concept, not on
the homepage): hourly vehicle counts by direction at four CDOT continuous counters (Copper
Mountain, Eisenhower Tunnel, Twin Tunnels, Genesee) for a hand-picked list of days.

**Purpose**: CDOT OTIS's Traffic Data Explorer runs on an undocumented, unauthenticated JSON API
with no CORS headers, so the browser can't call it; this script pre-fetches one request per
station per day. It also pulls NOAA GHCN-Daily snow/precip at Dillon, Georgetown and Loveland
Basin for each day +/-1, and stores the readings next to the day so the "snowy"/"clear" labels
can be checked. The day list (and how it was picked) is at the top of the script.
The four metro Denver counters (Sheridan, Dahlia, Havana, Aurora) are left out on purpose:
commuter volumes there would flatten the mountain bars.

**Requirements**: standard library only (no API keys)

**Usage**:
```bash
python scripts/generate_i70_traffic_data.py

# Re-run without re-fetching (reuses data/i70_traffic/raw/ cache)
python scripts/generate_i70_traffic_data.py --skip-download
```

**Output**:
- File: `public/data/i70-traffic/days.json`
- Size: ~14KB
- Prints a sanity table (daily total + peak hour per station x direction)

**Known data quirks**: a missing day comes back as `[]` or without one direction's row (e.g.
Genesee 2023-07-15, Tunnel WB 2023-01-28); the script keeps it as `null` and the page draws "no
data" rather than a zero. Single-hour dips (Genesee EB 6 PM on 2020-01-05) are kept as recorded.

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
