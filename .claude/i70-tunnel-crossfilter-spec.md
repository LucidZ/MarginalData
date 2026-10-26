# I-70 Eisenhower Tunnel Crossfilter — Gameplan

Written 2026-10-26 for a fresh context. Read `.claude/preferences.md` first (D3 for math, React
renders the SVG, one component per file, mobile at 600px, don't add features nobody asked for).

**Branch:** `i70-crossfilter`, new, off `main`. Make it a worktree at `../MarginalData-i70-crossfilter`
and symlink `node_modules` from the main checkout, the way the other worktrees do. **Don't stage the
`node_modules` symlink:** `.gitignore`'s `node_modules/` doesn't match a symlink.
**Dir:** `src/2026/I70Crossfilter/` · **Route:** `/2026/I70Crossfilter`, **unlisted.** Add it
straight to `src/App.tsx` like `/about` and keep it out of `ROUTES`, because every `ROUTES` entry shows up on the
homepage feed. Don't merge or deploy. Ask Lucas first.

Related, but a separate branch: `i70-traffic` (worktree `../MarginalData-i70-traffic`) has the
road-strip toy and `.claude/i70-traffic-poc-spec.md`. You don't need its code. Its data findings are
summarized below.

---

## 1. The idea

A [crossfilter](https://square.github.io/crossfilter/)-style explorer over **every hour of traffic
through the Eisenhower Tunnel, 1996 to 2026**. Brush any chart (day of week, month, year, hour,
weather, holiday) and every other chart updates to show only the matching days. The core question it
answers: *"what does an hour of tunnel traffic look like on days like this, compared with normal?"*

Tunnel only, for simplicity. The data pipeline also caches the other three counters (it costs almost nothing, see §2) for
later multi-counter work, but they **don't** go into the page.

---

## 2. Data source: OTIS annual endpoint (verified 2026-10-26)

CDOT OTIS (`https://dtdapps.codot.gov/otis/TrafficData`) runs on an unauthenticated JSON/CSV API
with no CORS headers, so everything is pre-fetched by a script. The endpoint names are listed in the page HTML
(`annualUrl`, `baseUrl`, … in an inline config block). The `.js` bundle only builds the paths.

**Use the annual endpoint. It returns one counter's full year in one request:**

```
https://dtdapps.codot.gov/otis/API/TRANSYS/GetDailyTrafficVolumeForStationByYear/{stationId}/{year}.csv
                                                                                   (or .json)
```

CSV columns: `COUNTSTATIONID,COUNTDATE(YYYYMMDD),COUNTDIR(P|S),HOUR0..HOUR23,FormattedDate`.
JSON: an array of the same fields with integer hours. About 90 KB per year as CSV, ~0.7 s per request.

- `P` = **eastbound** (toward Denver), `S` = **westbound** (toward the mountains). This was verified earlier against
  ski-day peaks (S peaks around 7am, P in the afternoon).
- **One row per day × direction. Days with no data are simply missing.** 2025 had 346 of 365
  days for the Tunnel (it was out Feb 12–24, plus scattered days). 1996 had all 366.
- ⚠️ **Missing hours come back as `0` in both the CSV and the JSON.** The per-day endpoint
  (`/GetDailyTrafficVolumeForStationByDay/{id}/true/{YYYY-M-D}.json`, strings with thousands
  commas, blank = missing) is the only way to tell "0 vehicles" from "no data". Checked against
  2025: 688/692 rows matched the per-day data exactly. The 4 that didn't were all `0`s that are
  blank per-day (e.g. 2025-10-07 WB: `…418, 7, 0, 0, 0`, an outage at 9pm).
  **Rule:** for every annual row containing a `0` hour, fetch that day from the per-day endpoint
  and take its blanks as missing. In 2025 only 4 rows had any zero, so this is cheap. Count how many
  rows there are across all years and report it. **Open question:** does the per-day endpoint ever
  show a real `"0"` (e.g. a full tunnel closure)? Check while doing this, and say what you find.
- **Be kind to the API.** Fetch one request at a time and sleep ≥1 s between requests. Use a backoff of 10/20/30 s on errors,
  logged. Cache every raw response in `data/i70_crossfilter/raw/` (gitignored by `/data/`) and
  support `--skip-download`. Lucas asked about this explicitly in the earlier session.

**Fetch:** 4 counters × 1996–2026 = ~124 requests, plus the per-day zero checks.

| Station | Name | Note |
|---|---|---|
| `000106` | Eisenhower Tunnel (segment MP 205.4–216.2) | **The only one used in the page** |
| `000119` | Copper Mountain | cache only |
| `000120` | Twin Tunnels | cache only |
| `000107` | Genesee | cache only |

Data runs through 2026-09-30 (as of 2026-10-21). Treat 2026 as a partial year and label it.
Station start dates: `/GetCountDatesForStation/true/{id}` → `{"countDates":[latest, earliest]}`.

## 3. Weather: NOAA NCEI GHCN-Daily (no key)

```
https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&stations={id}
  &startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&dataTypes=SNOW,PRCP,SNWD&units=standard&format=json
```

| Station | ID | Use |
|---|---|---|
| Dillon 1 E (co-op, HCN) | `USC00052281` | primary, ~3 mi from the tunnel's west side |
| Georgetown (co-op) | `USC00053261` | fallback when Dillon is missing |
| Loveland Basin (SNOTEL) | `USS0005K05S` | PRCP/SNWD only, no SNOW field |

**Check each station's period of record back to 1996 before relying on it.** Report coverage %
per year, and record which station supplied each day's value.

**Co-op stations report in the morning** (~7 AM; confirm Dillon's observation time from NOAA
station metadata if you can). So day D's report covers roughly 7 AM D-1 → 7 AM D. Define:
- `snowOvernight` = SNOW in **D's** report ("did it snow last night")
- `snowDay` = SNOW in **D+1's** report (snow while people were driving on D)
- `precipDay` = PRCP in **D+1's** report (the daytime precipitation Lucas means by "current weather")
- `snowDepth` = SNWD in D's report

The overnight/day split is deliberate. A **powder day** (snow overnight, then clear) probably *draws*
skiers, and a **storm day** probably *suppresses* traffic and slows it down. The two could push in
opposite directions, so don't merge them.

## 4. Features

**Grain:** two tables, joined in the browser by day index.

**`days`** (~11k rows), one per calendar day 1996-01-01 → 2026-09-30:

| Field | Type | Notes |
|---|---|---|
| `date` | ISO | |
| `dow` | 0–6 | |
| `month` | 1–12 | |
| `year` | int | 2026 partial |
| `holiday` | enum | `none`, `mlk`, `presidents`, `memorial`, `july4`, `labor`, `thanksgiving`, `xmas_ny` |
| `holidayPos` | enum | position in the holiday period: e.g. `fri_before`, `sat`, `sun`, `mon` for Monday holidays; Wed–Sun for Thanksgiving; `xmas_ny` = Dec 20–Jan 2 (choose a window and document it). Compute holidays with code (federal rules); don't hand-type dates |
| `snowOvernight`, `snowDay`, `precipDay`, `snowDepth` | float \| null | §3 |
| `wxStation` | enum | which NOAA station supplied the values |
| `wbTotal`, `ebTotal` | int \| null | null if any hour is missing |
| `wbSaturated`, `ebSaturated` | int | hours ≥ 90% of that direction's ceiling. **Ceiling = the 99.5th percentile of hourly counts for that direction within that year.** Capacity may have changed over 30 years; check whether the per-year ceiling moves and say so. 2025 reference: WB max 2,458 / 99.9th pct 2,331; EB max 3,040 / 2,903 |
| `closure` | bool | a midday hour (9am–6pm) under ~5% of that hour's median for the same weekday and month. A likely tunnel closure. **Validate:** show Lucas a handful of examples before trusting it |
| `netFlow` | int \| null | cumulative WB − EB starting Friday 00:00, at the end of this day. Weekends only; null otherwise (the "bathtub": extra cars west of the tunnel) |
| `complete` | bool | all 48 hour-values present |

**`hours`** (~270k rows), `{dayIdx, hour, wb, eb}`, with `null` for missing. Ship it compactly: two
`Uint16Array`s (wb, eb) of length `days × 24`, with `65535` = missing, in a `.bin` file, plus `days.json`.
Target **under 1 MB raw** for the binary (11k × 24 × 2 × 2 bytes ≈ 1.07 MB, so it's borderline). If
it's over, propose a fix (gzip-on-the-wire is automatic on GitHub Pages; or start at 2000) and **ask**.
Don't drop years silently. Check how `scripts/check-data-files.mjs` handles a non-JSON file.

Leave out for now: spring-break dates (no clean source) and hourly weather (only airport stations
that aren't on the corridor).

## 5. The page

Library: `crossfilter2` (the maintained fork on npm). It's a new dependency; just add it. Rendering:
D3 scales, React SVG, as in the rest of the site. Load the `dataviz` skill before writing chart code.

**Hero:** average vehicles per hour by hour of day for the **filtered days**, drawn over the
**all-days** curve in grey, so every filter reads as "different from normal". Toggle WB / EB, the
same colors as the road-strip toy (light `--wb: #2a78d6`, `--eb: #eb6834`; dark `#3987e5` /
`#d95926`, validated). Show "N days match" prominently.

**Filter charts** (brushable, one row of controls above):
- bars: day of week, month, year, holiday (category), hour of day (filters which hours feed the
  day-level charts)
- histograms: snowOvernight, snowDay, precipDay, snowDepth, daily total (current direction),
  saturated hours
- toggles: include closures (default off), include incomplete days (default off)
- a date strip / calendar of the matching days (30 years × 365, one mark per day)

Plus a table of the top 10 busiest matching days. It doubles as the accessible table view.

**Two correctness traps, which are the reason for the custom reduces:**
1. **Averages, not sums.** Crossfilter groups sum by default, so a month with more days looks
   busier. Every chart's group must track `sum` **and the number of distinct days**, and show sum ÷ days.
2. **Day-level charts over hour rows.** With hours filtered to 7–9 AM, the daily-total histogram
   must count **days**, not 3 hour rows per day. Use a distinct-day count in the reduce (e.g. per-group
   `Map<dayIdx, n>`). Test it: filter hours to 3 values and confirm the dow chart's day counts don't
   triple.

Keep it a tool, not a story: a one-paragraph intro plus a short "what you're looking at" note
(counts not speeds; overnight vs day snow; missing hours; closures). No scrollytelling, no OG card,
no homepage entry.

## 6. Things already learned (from the `i70-traffic` session, 2023–2025 data)

- Snow mostly **cuts volume**: snowy Sat 2025-12-06 had Tunnel WB 9.8k vs 20.2k the next clear Sat.
- Busiest Tunnel day of 2025 by daily total: **Fri 2025-01-03** (52.7k, both directions). Busiest across all four
  counters: **Sun 2025-07-27**. Summer Sundays filled most of 2025's top 10, which was a surprise.
- Jams show up in counts two ways, depending on where the counter sits relative to the bottleneck: a **mesa**
  (flat at the ceiling for hours, at or just past the bottleneck) or a **sudden drop** (the counter is
  stuck inside the queue). A Tunnel-only page can show mesas (saturated hours) but not tell which
  shape a drop is. That needs a neighbouring counter, which is why the other three are cached.
- Watch for one-hour dips and big swings (e.g. 2023-03-11 Tunnel EB 735 at 5 PM). Keep them as
  recorded.

## 7. Done when

- `scripts/generate_i70_crossfilter_data.py` runs from cache with `--skip-download`, and prints:
  rows per station × year, missing days per year, how many zero-rows were checked per-day and
  how many turned out to be missing, weather coverage per year, the per-year ceilings, and the
  number of flagged closures. Add a section to `scripts/README.md`.
- `npm run build` passes. `npm run lint` shows no new errors (it only lints JS; `vite.config.js`
  already has 2 errors). Run `npx tsc --noEmit -p tsconfig.json` and get no errors in the new files (the repo
  already has ~225 errors elsewhere).
- Playwright smoke test `tests/i70-crossfilter-smoke.mjs` (same pattern as `tests/voter-age-smoke.mjs`; serve with
  `npx vite preview --port <free port> --strictPort` and pass `BASE_URL`). At 1000px and 390px,
  it applies a couple of filters (e.g. Saturday + Jan–Mar + snowOvernight ≥ 4"), takes screenshots, fails on console errors,
  and checks that filtering stays responsive (< 100 ms per filter).
- Report to Lucas what the explorer shows. At minimum: powder-day vs storm-day Saturdays, how
  holiday weekends compare with ordinary ones, whether the per-year ceiling changed, the 30-year
  trend in summer vs winter weekends, and anything surprising.
- Commit on `i70-crossfilter` and push. Don't merge or deploy. Tell Lucas which dev server URL the
  page is on. One dev server at a time: Lucas asked to shut down stale ones (Expo servers on
  8081/8082 belong to other projects; leave those alone).
