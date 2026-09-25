# VoterAge: election explorer (2012–2024) — execution spec

Written 2026-09-25 for execution in a fresh context. Worktree
`/Users/lucas/code/MarginalData-voter-age`, branch `voter-age-participation` (last
commit `b835ae5`). Route `/2026/VoterAge`. Read this whole file before touching code.

## 0. What and why

The user is considering dropping beats 3 (education/income/race) and 4 (Colorado
all-mail) to simplify the story. In their place goes an **explorer**: the same
counts-on-y age chart that beats 1–2 build, with a year control that goes back
through every November election from **2012 to 2024** (7 cycles). If 2012 works well,
earlier years may follow later (see §9). This is a trial, so it is structured to be
easy to judge and easy to revert.

**Page after this change:**
1. Header (unchanged)
2. `AgeBeats` (beats 1+2, unchanged: 2024 build-up, then the cohort morph to 2022)
3. **New:** `Explorer` section: "3. Every election since 2012" (working title)
4. Sources footer (updated)

Beats 3/4 are removed in their **own commit** (§6), so reverting that one commit brings
them back if the user changes their mind.

## 1. Decisions already made (don't re-litigate)

- **Years: 2012, 2014, 2016, 2018, 2020, 2022, 2024.** All seven are machine-readable
  and verified to reconstruct within tolerance (§4).
- **Same construction as today:** PEP levels × CPS rates (spec v2 §5). No new method.
- **Beats 1–2 stay exactly as they are.** They read `data.byAge["2024"]` and `["2022"]` by
  key, so adding more keys doesn't touch them. Don't refactor their morph.
- **One JSON file.** 7 cycles ≈ 105 KB raw / ~20 KB gzipped. No per-year splitting and no
  field slimming.

## 2. Open decisions: recommendations below, confirm with the user if they object

| # | Decision | Recommendation (build this unless told otherwise) |
|---|---|---|
| D1 | What the explorer shows | **Registration view only**: eligible track, registered bar, votes bar, 65+ registration dotted line + gold gap, and the two hero figures. This is the view beat 2 ends on, so the reader arrives already knowing how to read it. The user prefers the fewest marks (see memory: "offer the fewest-marks version first"). A turnout-standard toggle is a possible follow-up, not v1. |
| D2 | Year-to-year transition | **In-place tween** (d3's 700 ms), bars stay at their age slots. **No cohort slide.** The slide only makes sense for a 2-year hop, and explorer readers jump arbitrarily (2012→2024). At a fixed age slot the question is "how did 22-year-olds do in 2014 vs. 2024", which is what an explorer is for. |
| D3 | Default year | **2024**, the chart the reader built in beat 1. |
| D4 | Year control | **Segmented buttons**, one per election, with midterms visually distinguished (see §5.2). No auto-play, no slider. |

## 3. Data pipeline changes (`scripts/generate_voter_age_data.py`)

### 3.1 Sources, all verified reachable 2026-09-25

| Year | P20 | URL under `https://www2.census.gov/programs-surveys/cps/tables/p20/` | Format |
|---|---|---|---|
| 2012 | 568 | `568/table01.xls` | legacy .xls |
| 2014 | 577 | `577/table01.xls` | legacy .xls |
| 2016 | 580 | `580/table01.xlsx` | xlsx, same layout as 2022/2024 |
| 2018 | 583 | `583/table01.xlsx` | xlsx, **two sheets** (see gotcha 1) |
| 2020 | 585 | `585/table01.xlsx` | xlsx, same layout as 2022/2024 |
| 2022 | 586 | `586/vote01_2022.xlsx` | existing |
| 2024 | 587 | `587/vote01_2024.xlsx` | existing |

PEP population by single year of age:
- **2012–2018:** `https://www2.census.gov/programs-surveys/popest/datasets/2010-2020/intercensal/national/asrh/nc-est2020int-agesex-res.csv`
  (30 KB; same `SEX,AGE,POPESTIMATEyyyy` schema as the current file; ages 0–100 plus 999
  total; columns `POPESTIMATE2010..2019` + `CENSUS2020POP`). Use the intercensal series, not
  Vintage 2020: it has been revised to agree with the 2020 Census, which is the same anchor
  as the V2024 file.
- **2020, 2022, 2024:** the existing `nc-est2024-agesex-res.csv` (`POPESTIMATE2020` is July 2020).
  Don't take 2020 from the intercensal file: it only has the April 1 census count, and every
  other year uses a July 1 estimate.

`parse_pep` currently reads one file for a list of years. Generalize it to take a
`{path: [years]}` mapping, or call it twice and merge. Either works; keep the ages 18–100
completeness check per year.

### 3.2 Parsing gotchas (each one was hit while prototyping)

1. **2018's workbook has sheets `["Table 1", "Table 1a"]` and the *active* sheet is 1a
   (margins of error).** `load_sheet` uses `wb.active`, which is why memory says "2018 is
   mislabeled at the source". It isn't. Select the sheet named `"Table 1"` when it exists,
   and **assert the title cell starts with `"Table 1."`, not `"Table 1a"`**, for every
   year. Without that check, 2018 parses silently as MOE values.
2. **2012/2014 are legacy `.xls`**: openpyxl can't read them. Add `xlrd` (reads .xls only
   in v2+, which is all we need). openpyxl lives in Homebrew's Python site-packages
   (`/opt/homebrew/lib/python3.14/site-packages`), and PEP 668 blocks a plain `pip install`.
   **Ask the user** before running `pip3 install --break-system-packages xlrd` (or suggest a
   venv). Don't convert the files by hand: no LibreOffice is installed, and the pipeline has
   to stay reproducible.
3. **2012/2014 layout differs from 2016+:**
   - The label is in **column 0** with leading dots (`".Total 18 years and over"`,
     `"..18 years"`, `"..80-84 years"`, `"..85 years and over"`). In 2016+ the marker is in
     col 0 and the age label is in col 1, with no dots.
   - Block markers are title case (`"Both sexes"`, `"Male"`, `"Female"`), not uppercase,
     and sit on their own rows.
   - The numeric columns therefore shift left by one: total pop = col 1, citizen = col 2,
     registered = col 3, voted = col 9 (vs. 2, 3, 4, 10 in 2016+).
   - **Recommended:** stop hard-coding indices. Normalize each row into (label, numbers):
     label = the last non-numeric text among the first two cells with dots stripped; numbers =
     the numeric cells in order. Then total pop = n[0], citizen = n[1], registered = n[2],
     voted = n[8]. Detect markers case-insensitively in **either** of the first two cells
     (in 2016+ the `BOTH SEXES` cell shares a row with `"Total 18 years and over"`).
     Prototyped: this one parser handles all 7 years.
4. Tail labels are the same in all seven years: `80-84 years` (hyphenated) and `85 years
   and over`. Single years 18–79 = 62 rows everywhere. Keep the existing count check.
5. Keep bounding the scan to the BOTH SEXES block (spec v2 gotcha #1): the Male/Female
   blocks repeat every age.

### 3.3 Output changes

- `CYCLES` becomes all 7 years, each with its filename and optional sheet name.
- Add `"kind": "presidential" | "midterm"` to each `byAge[year]` (year % 4 == 0 →
  presidential). The year control uses it; don't recompute it client-side.
- The existing `validate_age_reconstruction` runs **unchanged** for every year. The age-18
  hard range check is 2024-only. Leave it that way, since §4 has the other years' values
  for eyeballing.
- `meta.sources`/`sourceUrls`/`notes`: add the older P20 reports and the intercensal PEP
  file; update the note that says byAge covers 2022/2024.
- **Don't touch** `byDimension`/`colorado` in this step (that's §6).

## 4. Verification targets

Prototype run on 2026-09-25 (scratch script that imported the pipeline's own
`build_age_rows`/`finalize_age_cycle`/`validate_age_reconstruction`). All 5 new years
passed validation unchanged. The pipeline must reproduce these to the printed precision:

| Year | CPS published turnout | Reconstructed `avgTurnout` | `over65Turnout` | `over65Registration` | `crossoverAge` | `registrationGap` (k) | `registeredNotVoted` (k) | `totalCvap` (k) | age-18 `cvap` (k) |
|---|---|---|---|---|---|---|---|---|---|
| 2012 | 61.81 | 61.64 | 71.87 | 79.37 | 64 | 18,583.2 | 20,728.8 | 219,946.5 | 4,134.0 |
| 2014 | 41.94 | 41.71 | 59.31 | 75.33 | 63 | 25,019.6 | 51,141.2 | 225,203.4 | 4,107.6 |
| 2016 | 61.38 | 61.24 | 70.79 | 77.99 | 64 | 18,109.9 | 20,527.3 | 228,702.6 | 4,109.0 |
| 2018 | 53.44 | 53.28 | 66.04 | 75.90 | 64 | 22,054.3 | 31,435.6 | 233,708.0 | 4,273.4 |
| 2020 | 66.77 | 66.64 | 74.43 | 78.52 | 63 | 14,673.8 | 14,003.0 | 236,124.3 | 4,098.1 |
| 2022 | (existing) | 51.95 | 66.79 | 77.34 | 65 | 20,554.3 | 40,473.8 | 238,206.1 | n/a |
| 2024 | (existing) | 65.21 | 74.62 | 80.24 | 62 | 16,702.4 | 20,139.2 | 242,052.0 | n/a |

2022/2024 must come out **byte-identical** to the current `public/data/voter-age.json`
values. Diff the two cycles before and after; any change there means the parser refactor
broke something.

Sanity notes, not bugs:
- `registeredNotVoted` is a clean sawtooth (20.7 → 51.1 → 20.5 → 31.4 → 14.0 → 40.5 → 20.1 M).
  This is the midterm finding the explorer exists to show. 2014 (lowest-turnout midterm
  in decades) is the extreme.
- 2020 is the one year where registered non-voters (14.0M) is *smaller* than the
  registration gap (14.7M). That's real (pandemic mail voting, highest turnout since 1900).
  Nothing is wrong.

## 5. Explorer UI

### 5.1 Files

- `src/2026/VoterAge/Explorer.tsx`: the section. A normal (non-sticky, non-scrolly) block:
  title, one-paragraph intro, year control, chart, hero figures.
- `src/2026/VoterAge/YearControl.tsx`: the segmented buttons.
- `src/2026/VoterAge/ageRows.ts`: move `toBarRow` out of `AgeBeats.tsx` so both sections
  share it. Pure move; don't change it.
- Tooltip: `AgeBeats.tsx`'s `tooltipFor` is tangled with the step/morph state. Don't try to
  share it. Write a small registration-view tooltip in `Explorer.tsx` that mirrors the
  beat's `step >= REG_GAP_STEP` branch (age · year header, the pooled-rate note for 80+,
  eligible · registered · voted (turnout), the line at the year's 65+ registration rate,
  registered-vs-standard, and registered-but-didn't-vote).
- Copy (title, intro, control label, hero labels) goes in `copy.tsx`, following its
  existing rules: no hand-typed figures, and numbers come in through a `Vals` object.

### 5.2 Year control

- One `<button>` per cycle in a `role="radiogroup"`-style group (`aria-pressed` or
  `role="radio"` + `aria-checked`). Left/Right arrow keys move the selection.
- Midterms are distinguished with **text + style, not color alone**: small "midterm" /
  "presidential" labels under the row, or a dashed border on midterm buttons, with a
  two-item key. Use existing CSS tokens from `App.css`, not new hex colors.
- **Mobile, 360 px viewport:** 7 buttons have to fit in 328 px with no horizontal scroll.
  Below 400 px, labels shorten to `'12 '14 … '24`. The full year stays in `aria-label`.

### 5.3 Chart

Render `PopulationBars` with the props beat 1 uses at `REG_GAP_STEP` (read `AgeBeats.tsx`
for the exact set): `xKind="age"`, `showTrack`, `showVotes`, `registeredOpacity={1}`,
`registrationStandard={{ line: 1, gap: 1 }}`, `showExpected={false}`, `showGap={false}`,
`expectedLineLabel` = `at 65+ registration (X%)` for the **selected** year, `gapLegendLabel="Not registered"`.

- **Fixed `yDomain` across all 7 cycles** (max cvap over every year × 1.08), computed once.
  Otherwise the axis rescales under the reader and a year change looks like a zoom.
- `transitionMs={700}`, and rows keyed `age-N` exactly as in the beats, so d3 tweens bars in place.
- `heroGap.items`: "not registered" = `registrationGap`, "registered, didn't vote" =
  `registeredNotVoted`, swatches `gap`/`registered`, `delta: ""`, `deltaOpacity: 0`.
  (A delta vs. what? Previous cycle mixes election types. Leave it out.)
- No `plotOverlay`/`plotHaze` (those belong to the rewind morph).
- Every printed number comes from the selected cycle object, never from interpolated rows.

### 5.4 Copy (keep it short)

Intro paragraph (~2 sentences): same chart as above, pick any November election since
2012, midterms marked. Plus one sentence of caveat that is specific to multi-year data:
the population behind 2012–2018 comes from Census's 2010–2020 intercensal estimates,
which were revised after the 2020 count. Don't write numeric claims about trends in
prose. The chart carries them.

## 6. Remove beats 3/4 (separate commit, after the explorer works)

- `App.tsx`: remove `Beat3`/`Beat4` imports and render.
- Delete `Beat3.tsx`, `Beat4.tsx`, `ColoradoDots.tsx`; their CSS blocks in `App.css`; their
  copy in `copy.tsx` (`beat3*`, `beat4*` and their `Vals` interfaces); the `Dimension*`,
  `Colorado*` types and the `byDimension`/`colorado` fields in `types.ts`.
- Pipeline: remove the education/income/race/Colorado sections, the `RACE_VARIANTS`/
  `EDUCATION_GROUPS`/`INCOME_GROUPS`/`COLORADO` constants and their downloads, and the
  matching `meta.sources`/`notes`. Leave the cached raw files in `data/voter_age/` alone.
- `grep -rn "byDimension\|colorado\|Beat3\|Beat4\|ColoradoDots" src tests` must come back
  empty, and so must a grep for `beat3`/`beat4`.
- Check `tests/*.mjs` for anything that scrolls to or asserts on beats 3/4 (e.g.
  `voter-age-dark.mjs` shoots `voter-age-dark-beat3/4.png`) and drop those parts.

## 7. Tests (use the persistent `tests/` scaffold; don't write ad-hoc scroll helpers)

New `tests/voter-age-explorer.mjs`, same style as `tests/age-beats-steps.mjs`
(`BASE_URL` env, chromium, screenshots to `tests/screenshots/`):
1. Explorer section exists, has 7 year buttons, 2024 selected by default.
2. For each year: click it, wait > 700 ms, and assert the two hero figures equal
   `fmtM(registrationGap)`/`fmtM(registeredNotVoted)` from the JSON (fetch
   `/data/voter-age.json` in the test, don't hardcode). Screenshot each year.
3. The y-axis tick labels are identical across all 7 years (fixed domain).
4. Keyboard: focus the selected button, press ArrowLeft, and 2022 is selected.
5. Zero console errors and no `NaN` in any `transform` attribute (the NaN-tick bug from
   2026-09-16 is the precedent: capture console + scan the DOM).
6. 360×800 viewport: `document.documentElement.scrollWidth <= 360`, and all 7 buttons
   are visible and unclipped.
7. Hover one bar in a midterm year: the tooltip names that year.

Re-run the existing `tests/age-beats-steps.mjs` and `tests/voter-age-smoke.mjs`. Beats
1–2 must still pass untouched. Extend `voter-age-dark.mjs` with one explorer screenshot.
Then view the screenshots yourself (light, dark, 360 px) before calling it done.

## 8. Commit sequence (branch `voter-age-participation`; don't merge, push or deploy
unless the user asks)

1. Pipeline: 7 cycles, sheet-name fix, header-free parser, xlrd, `kind` field + regenerated
   JSON. The message notes that 2022/2024 are unchanged.
2. Explorer section + tests.
3. Remove beats 3/4 (the revertible one).

Update memory (`project_voter_age_participation.md`) at the end, and correct the stale
"2018 Table 1 is mislabeled at the source" claim: it's the active-sheet issue from §3.2.1.

## 9. Out of scope / later

- **2000–2010** (6 more cycles). All machine-readable .xls, same xlrd path. Gotchas: 2008
  is at `p20/562-rv/table-01.xls` and 2010 at
  `p20/voting-registration-2010-election/table1_2010.xls`. 2000–2006 are under
  `p20/{542,552,556,557}/tab01.xls`. Check their tail buckets before assuming 80-84/85+ (older
  tables pool from 75), and PEP would need the 2000–2010 intercensal file. The question for
  the user is whether the pooled-rate span (then 75+) is acceptable.
- **1976–1998:** 1998 is a fixed-width `.txt`. 1976–1992 are scanned image PDFs (OCR or
  IPUMS CPS microdata, which needs an account, so ask before signing up). 1994/1996 Table 1
  wasn't found. 1964–1974 only have age groups.
- Turnout-standard toggle (D1), and a small per-year trend strip under the control. Only
  build these if the user asks after seeing v1.
