# I-70 Mountain Traffic — Proof-of-Concept Spec

Branch: `i70-traffic` (new, off `main`) · Dir: `src/2026/I70Traffic/` · Route: `/2026/I70Traffic`
Status: **toy / proof of concept.** Do not merge to main or deploy. Every entry in `ROUTES`
shows up on the homepage feed, and this isn't ready for that. Ask Lucas before shipping.

Read `.claude/preferences.md` first (D3 for math, React renders the SVG, one component per
file, mobile at 600px, no extra features).

---

## 1. Why this exists

Lucas wants to see I-70 traffic between Denver and Summit County. The only free historical
data is **hourly vehicle counts** (no speeds), and a count is ambiguous: 2,000 cars/hour can mean
light traffic moving freely or a jam moving slowly. The open question is whether the *shape*
of a day across several counters along the road shows that difference. This toy exists to
**look at a handful of contrasting days side by side** and find out.

Lucas's hypothesis, which may turn out wrong: you can see a bump of traffic move from Denver
into the mountains (westbound) in the morning and from the mountains back to Denver
(eastbound) in the evening.

Not in scope: speeds, travel-time estimates, scrollytelling, OG card, homepage entry, any CDOT
contact.

---

## 2. Data source — verified 2026-10-21

CDOT OTIS Traffic Data Explorer (`https://dtdapps.codot.gov/otis/TrafficData`) runs on an
undocumented JSON API that needs no auth. I worked out the URL patterns from
`/otis/public/javascript/bundle.trafficexplorer.min.js` and tested them live.

Base: `https://dtdapps.codot.gov/otis/API/TRANSYS`

| Purpose | URL |
|---|---|
| Stations on a milepost range | `/GetTrafficStationsByRouteRefs/070A/{begMP}/{endMP}/false/true.json` (last two = short-duration, continuous) |
| Date range for a station | `/GetCountDatesForStation/true/{stationId}` → `{"countDates":["20260930","19960101"]}` (latest, earliest) |
| **Hourly counts for one day** | `/GetDailyTrafficVolumeForStationByDay/{stationId}/true/{YYYY-M-D}.json` (no zero-padding) |
| Monthly average daily traffic | `/GetMonthlyTrafficVolumeForStation/{stationId}.json` |

Hourly response: `[{"dir":"P", "h0":"90", ..., "h23":"143"}, {"dir":"S", ...}]`.
- Values are **strings with thousands commas** (`"1,471"`). Parse them.
- `P` = **eastbound** (milepost increasing, toward Denver). `S` = **westbound** (toward the
  mountains). I checked this on Jan 2026 ski days: P peaks in the afternoon, S at 7am.
- A missing day comes back as `[]`, or without a `P` row. Example: **Genesee 2025-07-09
  has no data.** Handle that and show a visible gap; never silently plot zeros.
- ~0.5 s per request. **No CORS headers**, so the browser can't call the API. Data must be
  fetched ahead of time by a script.

### Stations — use these four mountain counters, ordered west → east

| Station | Name | Segment (MP) | Plot at MP |
|---|---|---|---|
| `000119` | Copper Mountain (W of SH 91) | 179.9–195.3 | 195 |
| `000106` | Eisenhower Tunnel | 205.4–216.2 | 213.5 (tunnel location; segment midpoint is ~210.8) |
| `000120` | Twin Tunnels, Idaho Springs | 241.1–243.0 | 242 |
| `000107` | Genesee (E of Mt Vernon CC Rd) | 253.5–256.0 | 255 |

Copy `desc` from the stations endpoint. The "Plot at MP" values are my estimates: verify each
against the segment range and use a point inside it. I picked the tunnel at 213.5 because
that's the recognizable landmark.

Four more continuous counters sit inside the Denver metro (`000510` Sheridan, `000511` Dahlia,
`103078` Havana, `000002` Aurora). They carry commuter traffic at much higher volumes and would
flatten the mountain bars. **Leave them out of v1**, and mention it in the README/notes.

---

## 3. Known caveats — show these, don't hide them

1. **Cars join between counters.** Ramps add traffic at Silverthorne/SH 9, US-6 (Keystone/A-Basin),
   Loveland, Georgetown, and US-40 (Winter Park) at Empire. On Sun 2020-01-05 eastbound, the Tunnel counted
   28.7k and Twin Tunnels 44.2k. So the bars at two counters are not the same cars,
   and you'd expect them to grow toward Denver.
2. **Hourly is coarse.** A freely moving car covers Copper→Genesee (60 mi) in about an hour, so
   on a light day a "bump" crosses the whole corridor in one frame. A bump that visibly moves
   would itself be evidence of a slowdown. You can animate between hours for looks, but label the
   clock with the real hour and never invent sub-hour values.
3. **What a jam looks like in counts.** A count that hits a ceiling and stays flat for hours
   (a mesa, not a peak), plus a late tail where downstream counters stay high after upstream
   ones drop. Example: Twin Tunnels EB on 2020-01-05, 11am–6pm:
   `3382 3795 3872 3863 3429 3769 3686 3530`.

---

## 4. Days to compare

Target 5–7 days. Lucas's grid:

| Slot | Why |
|---|---|
| Winter Saturday, **snowy** | snow → lower capacity? |
| Winter Saturday, **clear** | same day of week, weather removed |
| Winter Wednesday, clear | weekday baseline |
| Summer Saturday, clear | season contrast |
| Summer Wednesday, clear | summer weekday baseline |

Plus two anchor days with data already confirmed at all 4 stations:

| Date | Label | Why |
|---|---|---|
| 2020-04-12 (Sun) | COVID lockdown Sunday | certain free flow; Tunnel EB total only 3.6k |
| 2020-01-05 (Sun) | End of record New Year's weekend | probably jammed; Twin Tunnels EB flat at ~3,800/hr |

Saturday's jam is westbound in the morning. Sunday's is eastbound in the afternoon. Consider
a snowy and a clear winter **Sunday** too, if it doesn't crowd the view.

How to pick the slot days (do this first; it's the riskiest step):
- **Weather.** Use NOAA NCEI daily summaries (GHCN-Daily, `SNOW`/`PRCP`, no key) from a station
  near the corridor, such as Dillon or Georgetown. Find a real station ID yourself; nothing here is pre-checked.
  "Snowy" = measurable new snow that day or overnight. "Clear" = no precipitation
  that day or the day before.
- **Avoid holidays** unless a holiday is the point, and avoid any day with a missing station.
- Prefer recent seasons (2023–2026), and prefer pairs with similar daily totals so the
  comparison is about *shape*.
- Write down for each day *why* it's in the slot (snowfall amount, station, source) in the data file.
  Lucas will check these.

---

## 5. Pipeline

`scripts/generate_i70_traffic_data.py`:
- Hard-coded list of `{date, label, slot, note}` at the top, so adding a day is easy.
- Fetch 4 stations × N days (≈30 requests). Cache raw responses in `data/i70_traffic/raw/`
  and support `--skip-download`, like `generate_voter_age_data.py`.
- Output `public/data/i70-traffic/days.json` (small; commit it):

```jsonc
{
  "generated": "2026-10-..",
  "source": "CDOT OTIS ...",
  "stations": [{ "id": "000119", "name": "Copper Mountain", "mp": 195 }, ...],  // west→east
  "days": [{
    "date": "2020-01-05", "weekday": "Sun", "label": "...", "slot": "anchor", "note": "...",
    "counts": { "000119": { "eb": [24 ints|null], "wb": [24 ints|null] }, ... }
  }]
}
```

- Add a section to `scripts/README.md`.
- Print a sanity table when it runs (daily total and peak hour per station × direction) and paste it
  into the commit message or your report.

---

## 6. The toy

One page, no scrolling story. Three pieces, all driven by a single shared clock (hour 0–23):

**A. Road strip (main view).** A horizontal road running west (left, Copper) to east (right,
Genesee), drawn with a double-yellow centerline. x = milepost on a linear scale, so the
counters are unevenly spaced, as they are in reality. Label towns/landmarks under the road.
At each counter:
- **Westbound bar grows up** from the centerline and **eastbound bar grows down**, which
  matches driving on the right when west is on the left. Colour the two directions differently,
  and add a direction arrow in each lane.
- Bar height = vehicles in that hour. **Use the same y scale across all days.**
- Show the value on or next to each bar.

**B. Compare mode.** Stack one road strip per selected day (small multiples), all on the same
clock and scale. This is the main point. Day selector = chips with the labels from §4.
On phones, stack vertically and keep it readable.

**C. Daily curves (static companion).** For the selected days: hour (x) vs count (y), one
line per station, with eastbound and westbound in separate panels. A vertical line marks the
current clock hour. This is where mesas and tails will be easiest to see.

Controls: play/pause, hour scrubber (0–23), speed toggle (e.g., 1 s or 0.4 s per hour),
day chips. Animate bars between hours with a short D3 transition (or a rAF tween
in React state). The clock reads the real hour ("4 PM"), not tweened fractions.

Load the `dataviz` skill before writing chart code (palette, mark specs, dark mode).
Use the theme tokens from `src/index.css`.

Not in scope: tooltips beyond the bar value, maps, URL state, story text beyond a one-
paragraph intro plus the caveats from §3 in a short "What you're looking at" note.

---

## 7. Done when

- `npm run build` passes; `npm run lint` shows no new errors.
- Playwright smoke script `tests/i70-traffic-smoke.mjs` (pattern: `tests/voter-age-smoke.mjs`):
  loads the page at 1000px and 390px, presses play, captures frames at hours 7, 12, 17,
  and fails on console errors.
- Looking at the screenshots, report honestly to Lucas: **is there a visible westbound
  morning / eastbound evening bump? Does it visibly travel, or does it rise everywhere at
  once?** Do the snowy-vs-clear and anchor days look different, and how? This answer is the
  real deliverable.
- Commit on `i70-traffic` and push. Don't merge or deploy.
