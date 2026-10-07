# VoterAge: split the voter shortfall into two benchmark-relative parts

Status: **implemented 2026-10-02, uncommitted.** Branch `voter-age-participation`.
Deviations: `--gap-turnout` = the existing `--gap` and `--gap-reg` is a deeper ochre
(`#a8640a` light / `#bf7a18` dark): every paler gold failed the validator's lightness band.
Step 5 shows the hero tiles; the chart itself is unchanged from step 4. `expectedRegistered`
was dropped from the JSON.

## Why

Beat 1 shows the **voter shortfall**: gold between each age's votes and the dotted
65+ turnout line (2024: 23.3M). Steps 4-5 then show two "hurdles":

- **registration shortfall**: people below the 65+ *registration* rate (16.7M), against a
  second dotted line, and
- **registered but didn't vote**: a raw survey count, all ages, including the 65+ group
  itself (20.1M, pale green).

These are different kinds of number. 16.7 + 20.1 = 36.8M ≠ 23.3M, yet the copy says the
shortfall "can be split into two parts". The mismatch has two causes:

1. The registration gap treats every missing registrant as a lost vote. Even 65+
   registrants vote only ~93% (2024), so ~1.2M of the overcount comes from here.
2. The pale green counts *all* non-voting, including the ~7% of registrants who don't vote
   even in the 65+ benchmark group. That's ~12.5M of the overcount.

The user wants the two hurdles grouped by color (two shades of the shortfall gold). That's
only honest if they really are two parts of the gold. So change the data so they are.

## The decomposition

Per cycle: `R` = 65+ registration rate, `T` = 65+ turnout rate (both `/cvap`),
`S = T / R` = 65+ show-up rate (votes per registrant).

For each age with `gap = expected - votes > 0` (the existing gold wedge,
`expected = cvap * T`):

```
regShort  = (cvap * R - registered) * S   # votes lost because people aren't registered
turnShort = registered * S - votes        # votes lost because registrants vote less than 65+ do
```

These sum to `gap` **exactly**: `cvap*R*S - votes = cvap*T - votes`.

One of them can go negative at a few ages: registration above the 65+ rate (`regShort < 0`)
or show-up above the 65+ rate (`turnShort < 0`). In that case clamp it to 0 and give the
whole gap to the other piece. The sum then still equals `gap`, so the two shades always
fill the gold wedge exactly. In the prototype run, 4 ages were clamped in 2024 and 8 in 2022.
Ages with `gap <= 0` get 0 for both, the same no-surplus rule as the existing wedge.

Prototype totals (computed from current `public/data/voter-age.json`, millions):

| Year | Kind | S (65+) | Voter shortfall | Registration part | Turnout part |
|------|------|--------:|----------------:|------------------:|-------------:|
| 2012 | pres | 90.6% | 23.2 | 16.6 | 6.6 |
| 2014 | mid  | 78.7% | 40.3 | 19.6 | 20.7 |
| 2016 | pres | 90.8% | 22.5 | 16.3 | 6.2 |
| 2018 | mid  | 87.0% | 30.8 | 19.1 | 11.7 |
| 2020 | pres | 94.8% | 19.3 | 13.8 | 5.5 |
| 2022 | mid  | 86.4% | 36.1 | 17.6 | 18.5 |
| 2024 | pres | 93.0% | 23.3 | 15.5 | 7.8 |

**What this changes in the story:**

- In presidential years the **registration part is the bigger hurdle**, about 2:1. The old
  numbers (16.7 vs 20.1) implied the opposite. Copy has to follow.
- The midterm story gets sharper. The registration part stays roughly 14-20M every cycle,
  while the turnout part roughly doubles to triples in midterms. This is "registered, but
  staying home" in like-for-like units.
- Both figures are now **votes relative to the 65+ standard**, not survey head-counts. Label
  them as votes, for example "votes short: not registered" and "votes short: registered,
  didn't vote as often". Footnote once that the registration figure is votes, not people:
  16.7M people below the 65+ rate × 93% ≈ 15.5M votes.

## Chart changes

- **One dotted line throughout:** the 65+ turnout line. Remove the 65+ registration line
  (`registrationStandard`, `pb-line-reg`, `expectedRegistered` line drawing) and the
  "at 65+ registration (80.2%)" legend entry.
- **Drop the pale-green registered bar** from the age chart. Without it the chart has one
  green, two golds, and the gray track.
- **Stack order** inside the gold wedge, bottom-up, following the funnel:
  votes → `turnShort` (registered, voted less) → `regShort` (not registered) → dotted line.
- **Colors:** two shades of the existing gold. Suggested: lighter gold for `turnShort` and
  the existing `--gap` (or deeper ochre) for `regShort`. Add `--gap-turnout` and
  `--gap-reg` tokens with dark-mode pairs in all three theme blocks of `App.css`. Run the
  dataviz skill's validator on the pair against `--surface-1` in both themes, and check
  that the two golds stay distinguishable from each other and from the votes green.
- **Step sequence** (keep step indices so the tests and scroll math barely move):
  - `LINE_STEP` (2): dotted line. Unchanged.
  - `TOTAL_STEP` (3): one gold wedge plus the total. Unchanged.
  - `REG_STEP` (4): the wedge splits. The `turnShort` shade appears at the bottom of the
    wedge, labelled.
  - `REG_GAP_STEP` (5): the `regShort` shade is emphasized. Hero tiles show both parts and
    note that they sum to the step-3 total.
  - `MORPH_STEP` onward: same two shades through the 2024→2022 morph and explorer hops.
- **Hero tiles** (`heroGap` in `AgeBeats.tsx` ~L461-490): the two figures become
  `regShort` and `turnShort` totals. `swatch` types change from `"gap" | "registered"` to
  the two gap shades. The 2022 deltas use the new fields.
- **Tooltip** (`AgeBeats.tsx` ~L320-335): show the per-age split under the existing
  "vs. that benchmark" line.
- **Summary chart** (`stackSegments`, `SummaryBar`, `SEGMENT_CLASS` in `PopulationBars.tsx`
  ~L40-66; `summaryBars` and `focusMax` in `AgeBeats.tsx` ~L238-250). Segments become
  `[votes, turnShort, regShort, cvap - votes - turnShort - regShort]`. Note that
  `votes + gap` equals `expected` only where an age is under the line; ages above it just
  have zero gap. The focus step pulls out segments 1 and 2 as now. Update
  `summaryCopy.segmentLabels`.

## Pipeline (`scripts/generate_voter_age_data.py` ~L296-345)

- Per row: add `regShort` and `turnShort` (thousands, ≥0, rounded to 0.1). Compute them
  from the unrounded values before the existing rounding.
- Per cycle: add `registrationShortfall` and `turnoutShortfall` (sums), plus
  `over65ShowUp` (percent).
- Assertion: for every cycle, `|regShort + turnShort - Σ max(0, expected - votes)| < 0.5`
  (thousands, allowing for rounding). Raise on failure, same style as the existing CPS
  reconciliation checks.
- Keep `registered`, `registeredRate`, `registrationGap` and `registeredNotVoted` in the
  JSON. They are still useful for footnotes and the tooltip. Mark the last two in
  `types.ts` and the `meta.units` string as "reference only, not drawn". Whether to keep
  `expectedRegistered` is optional; nothing would draw it.
- Regenerate `public/data/voter-age.json` and run `scripts/check-data-files.mjs` if it
  covers this file.

## Front-end touch points

- `types.ts`: new `AgeRow` / `AgeCycle` fields.
- `ageRows.ts`: `toBarRow` passes them through; `hopRows` lerps them like `missing`.
- `PopulationBars.tsx`:
  - `PopulationBarRow` gets the new fields.
  - Replace the `pb-gaps-reg` layer with two stacked gap layers. `drawGapLayer` already
    takes bottom/top accessors: use `votes → votes+turnShort` and
    `votes+turnShort → expected`. While only one gold shows (step 3), draw the existing
    single layer; crossfade to the split at step 4.
  - Remove the registered-bar layer, or leave it at opacity 0 and remove it later.
  - Update the legend.
- `AgeBeats.tsx`: step wiring above, the `heroGap` items, the tooltip, the summary,
  `shortfallOf` (still valid for the total), and the comments at ~L27-30 and L57-62.
- `copy.tsx`:
  - The step-4 heading "split into two parts" becomes accurate. Keep it, but rewrite the
    body (it currently says "The paler green is everyone who registered but didn't vote").
  - Step 5 body: drop "The dotted line is how many would be registered…" and
    "the gold between that line and the paler bars". Restate the hurdle as votes lost.
  - Move the `Gloss` note on self-reported registration so it still attaches.
  - Rewrite the 2022 beat (~L200-215): `regGap2022` and `notVoted2022` become the new
    figures, and the "gold grows" sentence changes.
  - `summaryCopy` placeholders.
  - Rename the `CopyVals` fields to match (e.g. `regShort2024`, `turnShort2024`).
- `App.css`: new gap tokens; retire `--registered` if nothing else uses it (grep first).

## Tests

All under `tests/` (see the memory note on the persistent Playwright scaffold; don't
rewrite the scroll helpers). Update the selectors and assertions that reference
`pb-registered`, `pb-line-reg`, `pb-gaps-reg` or the old tile labels:
`age-beats-steps.mjs`, `beat2-morph.mjs`, `gap-shots.mjs`, `voter-age-explorer.mjs`. Add one
data check that, on the 2024 step 5, the two hero figures sum to the step-3 total
(±0.1M).

## Out of scope

- Changing the benchmark itself (still 65+, per cycle).
- Phone layout changes beyond whatever the legend/tile changes force.
- Final summary copy. It stays a placeholder; just keep it consistent with the new data.

## Done when

- [x] The pipeline emits the new fields and the sum assertion passes for all 7 cycles.
- [x] The age chart shows one dotted line, one green and two golds; no pale green or
      registration line anywhere.
- [x] At step 5 the 2024 hero tiles read about 15.5M and 7.8M; the step-3 total reads 23.3M.
- [x] The 2022 morph shows the turnout gold swelling while the registration gold holds.
- [x] The summary bars use the new segments, and the focus step shows the midterm swell.
- [~] Light and dark themes are validated; the Playwright suite passes (except checks already failing at
      27937e3: explorer 375x667 band 246px<250, morph-axis-tooltip, tooltip-check, cohort-slide); screenshots are
      reviewed at desktop and phone widths.
