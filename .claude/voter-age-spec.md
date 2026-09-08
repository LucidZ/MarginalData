# Voter Participation by Age — Development Spec

Story working title: **"The Electorate Is Older Than the Country"**
Route: `/2026/VoterAge` · Branch: `voter-age-participation` · Group: `Government & Politics`

Every number in this spec was computed from the source files listed in §2 during planning
(2026-09-03) and is quoted to the precision shown. Re-derive them in the pipeline; do not
retype them into the frontend by hand. §7 explains why.

---

## 1. Premise

Voting is one-person-one-vote, but *turnout* is not age-neutral — so the electorate that
actually shows up is systematically older than the population eligible to vote. The core
visual is a scatter: **share of eligible citizens (x) vs share of votes cast (y)**, with a
45° line marking perfect proportionality. Below the line = underrepresented.

Verified 2024 headline numbers:

| Age | % of eligible citizens | % of votes cast |
|---|---|---|
| 18–24 | 11.7 | 8.5 |
| 25–34 | 16.5 | 14.4 |
| 35–44 | 16.2 | 15.8 |
| 45–64 | 31.1 | 33.3 |
| 65+ | 24.6 | 28.1 |

Two facts that carry the story:

- **Under-35s are 28.2% of eligible voters and cast 22.9% of votes. 65+ are 24.6% of eligible
  voters and cast 28.1%.** In counts: 65-and-over cast **43.3M** votes; *everyone* under 35
  cast **35.3M**.
- **Using single years of age, the crossover is about age 40.** Below it your cohort casts
  fewer votes than its share of the population; above it, more. (3-year-smoothed ratio crosses
  1.0 at 40, dips, and stays above from 44 on — say "around 40", never "exactly 40".)

Turnout by single year runs from **37.2% at age 18** to a peak of **77.7% at age 77**, then declines.

---

## 2. Data sources — all verified reachable

US Census Bureau, CPS November Voting and Registration Supplement. Public domain, no key.

| Year | Table 1 (national, single year of age) | Table 4c (states, 5 age bins) |
|---|---|---|
| 2024 | `.../cps/tables/p20/587/vote01_2024.xlsx` | `.../cps/tables/p20/587/vote04c_2024.xlsx` |
| 2020 | (same dir, `585`) | `.../cps/tables/p20/585/table04c.xlsx` |
| 2018 | `583` | `.../cps/tables/p20/583/table04c.xlsx` |
| 2016 | `580` | `.../cps/tables/p20/580/table04c.xlsx` |

Base: `https://www2.census.gov/programs-surveys/cps/`. Landing pages are
`census.gov/data/tables/time-series/demo/voting-and-registration/p20-{587,585,583,580}.html`.

**Schema warnings the pipeline must handle:**
- Header row differs by year: 2024 data starts row 6, 2016/2020 start row 5 (2016 has no blank row 4).
- Age labels differ: 2024 uses `"18 to 24 years"` / `"65 years and over"`; 2016/2020 use
  `"18 to 24"` / `"65+"`. Normalize with an explicit map, and **assert 5 bins per state** —
  a silent label change must fail the build, not drop a state.
- State names are uppercase, appear only on the first row of each state's block; the age rows
  below have a blank col A. Forward-fill.
- Columns (0-indexed): 3 = total citizen population, 9 = total voted, 13 = MOE on percent
  voted (citizen). All counts in **thousands**.
- Table 1 rows: five-year bins first, *then* single years `18 years`…`79 years`, then
  `80-84 years` and `85 years and over`. Match single years with `re.fullmatch(r"\d+ years")`
  or you will pick up the `75 years and over` aggregate and double-count. Single years 18–79
  cover only **94.6%** of CVAP — include the 80–84 and 85+ rows so shares sum to 100%.

---

## 3. Pipeline — `scripts/generate_voter_age_data.py`

Follow the conventions in `scripts/generate_six_degrees_data.py` (argparse, module docstring,
cached raw downloads under `data/`, writes to `public/data/`). Add a section to
`scripts/README.md`.

Downloads the 8 workbooks to `data/voter_age/` (gitignored, ~250KB total — small enough that
committing them is also defensible; prefer caching + committing the derived JSON only).

Output `public/data/voter-age.json`:

```jsonc
{
  "meta": { "source": "...", "retrieved": "2026-09-03", "units": "thousands" },
  "nationalByYearOfAge": [
    { "age": 18, "cvap": 4258, "voted": 1586, "shareElig": 1.80, "shareVote": 1.03, "turnout": 37.2 }
    // ages 18-79 + { "age": 82, "label": "80-84" } + { "age": 87, "label": "85+" }
  ],
  "nationalByBin": [ /* 5 bins, 2016 / 2020 / 2024 */ ],
  "states": [
    { "state": "OKLAHOMA", "abbr": "OK", "row": 6, "col": 5,
      "years": { "2016": {...}, "2020": {...}, "2024": {...} },
      "under35Gap": -8.17, "moeVoted1824": 8.4, "mailStatus": "never" }
  ]
}
```

`shareElig` / `shareVote` are percentages of the national (or in-state) column totals, computed
in the script. `under35Gap` = `shareVote(18-34) - shareElig(18-34)`, in percentage points.

`mailStatus` ∈ `permanent-pre2016` (CO, OR, WA) · `permanent-post2020` (CA, NV, VT, HI, UT, DC)
· `covid-only` (NJ, MT) · `never` (the other 40). See §5 for why these four categories and not two.

---

## 4. Story beats

Author's beat order (2026-09-03), with one reordering recommended:

| # | Beat | Level | Status |
|---|---|---|---|
| 1 | Here's voter turnout by age | national | verified, §5 |
| 2 | It's far more extreme in midterms | national | **verified, strongest finding — §6** |
| 3 | It varies by state | state | verified w/ caveat, §7 |
| 4 | Might mail-in voting help? | state | suggestive only, §8 |

**Reordering note:** the author's tentative order was 1 / state / midterms / mail-in. Swapping
midterms to beat 2 keeps the two national beats together and the two state-grid beats together,
instead of bouncing national → state → national → state. Beats 3 and 4 share one grid component,
so they want to be adjacent. Mail-in stays last either way — it is the weakest evidence and works
best as the closing "so what would change this?" question rather than a claim.

---

## 5. Beat 1 — turnout by age (national)

Sticky scatter that accumulates:

1. **Empty axes + 45° line.** "If every age group voted at the same rate, every dot would land
   on this line."
2. **Five binned dots land** (§1 table). Read the deviation.
3. **Switch to single years of age** — 64 dots sweeping lower-left to upper-right, crossing the
   diagonal around age 40. Animate bins splitting into constituent years.
4. **Shade below-line vs above-line** at the crossover.
5. **Count reveal:** 43.3M votes from 65+, 35.3M from everyone under 35 — despite under-35 being
   the larger eligible group.

Chart: scatter, 45° reference, colour by age along a sequential ramp. With single years each
point sits at ~1–1.8% on both axes, so **zoom the domain to the data, not 0–100**, or the arc
collapses to a smudge.

Run the `dataviz` skill before writing chart code. Structural precedents: `src/2026/MarginalTax/`
(`STEPS` array + sticky viz) and `src/2026/DebtSpin/` on branch `debt-spin-scrollyteller`
(step configs that drive chart *modes* — the pattern this story needs). Load via
`src/hooks/useJsonData.ts`.

---

## 6. Beat 2 — midterms (the strongest finding in the story)

National under-35 gap and turnout by election type. All verified:

| Year | Type | under-35 gap | under-35 turnout | 65+ turnout | 65+ / under-35 |
|---|---|---|---|---|---|
| 2016 | Pres | −5.91 | 48.9% | 70.9% | 1.45 |
| 2018 | **Mid** | **−8.28** | 38.2% | 66.1% | 1.73 |
| 2020 | Pres | −4.33 | 56.7% | 74.5% | 1.31 |
| 2022 | **Mid** | **−9.43** | **34.7%** | 66.8% | **1.93** |
| 2024 | Pres | −5.29 | 53.1% | 74.7% | 1.41 |

**In 2022 over-65s voted at nearly twice the rate of under-35s.** The mechanism is the real
payoff and the chart should make it visible: **65+ turnout barely moves between election types
(66–75%), while under-35 turnout collapses from 53–57% to 34–38%.** Older voters turn out
regardless; younger voters turn out for presidential races.

This effect is large, consistently signed across four cycles, and measured at the national level
where CPS precision is good (national MOEs ~1pp, vs ±8.4pp for state age cells). It is by a wide
margin the best-evidenced claim in the piece — give it more room than the mail-in material.

Suggested form: the same scatter, toggling 2022 vs 2024 so the whole cloud visibly slides down
and left; or a small-multiples strip of all five cycles. Requires Table 1 for 2018 and 2022, so
pull all five years in the pipeline (§3).

**As shipped (2026-09):** not the 5-bin scatter above - continues directly from Beat 1's
single-year-of-age transform instead. Table 1 turned out to be available for one midterm (2022)
alongside the three presidential cycles (2018 is the only gap, and that's the mislabeled-file
issue in §2/pipeline NOTE, unrelated to election type) - `nationalByYearOfAge` in the pipeline
output was widened from 2024-only to `Record<year, SingleYearRow[]>` for 2016/2020/2022/2024 to
support this. Beat 2 overlays 2022's and 2024's (age, gap) curves as two connected lines on one
chart (`AgeScatter`'s new `connectLines` prop, grouping points by `colorClass`): same S-shape,
visibly wider swing at both ends in the midterm (age 18: −1.06pp vs −0.77pp; peak ~age 82:
+0.73pp vs +0.44pp - all computed live, not hand-typed). The closing turnout-ratio insight
(65+ barely moves, under-35 collapses) is unchanged in substance, now stated for 2022-vs-2024
specifically rather than "the worst midterm" across all five cycles, so it doesn't cite a year
that isn't drawn on screen. The 5-cycle table above is still useful context/backup for why 2022
was picked as the midterm example - it's the more extreme of the two available (2018 is
unusable here since it has no single-year data).

---

## 7. Beat 3 — it varies by state

All **51** jurisdictions have a negative under-35 gap in 2024: DC **−0.74** to Oklahoma
**−8.17**, median **−5.43**. Not one is at parity. Universality is the headline; the ranking is
the supporting detail, and it is much noisier than it looks.

**Build requirement — pool years, do not map a single cycle.** I tested whether state differences
replicate: correlation of the state gap across year pairs among the 40 never-mail states is
2016↔2024 r=+0.47, 2016↔2020 r=+0.41, 2020↔2024 r=+0.51, 2018↔2022 r=+0.44 — **mean r ≈ +0.46.**
So only about **21% of observed between-state variance is real, persistent state difference; ~79%
is sampling noise.** States do genuinely differ — this is not a pure-noise null — but any single
year's ranking is mostly noise. **The grid must display a pooled average across 2016/2020/2024**
(√3 noise reduction), with midterms pooled separately if shown at all.

Other honesty requirements:
- Median CPS MOE on a state's 18–24 "percent voted" is **±8.4pp** (range 3.4–16.6); between-state
  SD of the gap is **1.68pp**. Show this — error bars on the detail view, or a visible noise band
  that most states fall inside.
- Do not invite readers to read individual state ranks. Bucket, or sort with visible uncertainty.
- No state-level single-year-of-age data exists. Table 4c is 5 bins only. Do not promise beat 1's
  granularity here.

Grid cartogram, 51 tiles, hardcoded row/col per state — no geo file needed.
`USWealthLandCartogram/data/states-geo.json` on branch `us-wealth-land-cartogram` is the
real-geography alternative if a tile grid reads as too abstract.

---

## 8. Beat 4 — might mail-in voting help?

Pose it as the question it is. The cross-section does not answer it and the story should say so.

**Cross-section (2024):** all-mail states average **−4.30** vs **−5.48** elsewhere. Directionally
consistent, but Welch **t = 1.69, not significant** (n=9 vs 42). Rhode Island, Maryland, New
Hampshire and Iowa — none all-mail — outperform almost every all-mail state; Colorado, Oregon,
Utah, Nevada and Hawaii sit mid-pack. Highlighting mail states on the grid will **not** show a
clean pattern, and that is worth showing honestly rather than hiding.

Caption it as *"a 1.2pp average difference the data can't cleanly separate from noise"* — not
"no effect", not "mail voting works". A 1.2pp shift in cohort vote share is electorally
meaningful; the problem is precision, not size.

**The natural experiment (much better identified).** States that switched all-mail **on and then
back off** around COVID:

| Group | 2016 | 2020 | 2024 | pattern |
|---|---|---|---|---|
| Never-mail (n=40) | −5.77 | −4.77 | −5.49 | +1.00, then −0.72 |
| Permanent adopters | −6.92 | −4.91 | −4.74 | +2.02, then +0.16 — on, stayed on |
| **New Jersey** (all-mail 2020 only) | −6.30 | **−2.05** | −5.24 | **+4.25, then −3.19** |
| Montana (county-option 2020 only) | −8.55 | −4.33 | −5.35 | +4.22, then −1.02 |

Against the never-mail baseline, New Jersey's DiD is **+3.25pp switching on, −2.47pp switching
off.** It went and it came back.

Why this beats the cross-section: **mean reversion cannot explain a reversal.** Among never-mail
states, `change = −2.36 − 0.478 × level₂₀₁₆` (r = −0.49), so a state starting at the adopters'
2016 mean is predicted to improve +1.28pp with no policy change — which kills the naive
adopters-only DiD (+2.42pp, roughly half reversion). It does not touch NJ, because reversion
predicts continued improvement in 2024 and NJ snapped back instead.

**Limits, in the story text and not only a footnote:**
- n = 2 reverting jurisdictions. Montana's switch-off is weak (−0.30 DiD); only NJ shows the clean
  on-off. Show both — do not quietly drop Montana.
- 2020 is a COVID election. The DiD absorbs the common shock but not anything hitting NJ differently.
- Placebo failure: CO/OR/WA were already all-mail before 2016 and should have moved ~0 from
  2016→2024. They moved **+1.12pp** vs +0.40 for never-mail. That unexplained drift is a caveat
  on all of beat 4.

Verdict to write toward: *suggestive, directionally consistent across four independent groups,
not proof.* Sizeable if real — NJ's 4.25pp swing in a ~4.5M-vote state is ~180,000 votes moving
between age cohorts.

---

## 9. Integrity guardrails

1. **No hand-typed numbers in the frontend.** Every figure in prose comes from the JSON via a
   formatter, or a build-time constant from the pipeline. Same rule DebtSpin carries; it exists
   because prose and data drift apart on revision.
2. **CPS is self-reported and overstates turnout** (~65.3% reported vs ~63.9% actual VEP, 2024).
   Shares-of-total are more robust than levels, but overreporting is *differential* by group so it
   does not fully cancel. One sentence in the methodology note; link
   [electproject CPS over-report correction](https://www.electproject.org/election-data/cps-vote-over-report-and-non-response-bias-correction)
   and Hur & Achen (2013).
3. **Never call the mail-in cross-section significant.** t = 1.69.
4. **Do not describe beat 4 as causal.** "Consistent with", "the pattern you'd expect if",
   "suggestive". Never "caused" or "proves".
5. **Eligible = citizen voting-age population**, not total voting-age population. Table 4c has both
   (cols 2 and 3); total pop would confound the youth gap with non-citizen share — exactly the
   confounder that makes TX/CA look artificially bad. Use col 3.
6. **Beat 3 must pool years.** A single-cycle state map is ~79% noise (§7).
7. `Footnotes.tsx` / `Sources.tsx` exist — use them; list all Census tables used.

---

## 10. Build steps

1. Branch `voter-age-participation` off `main` (**not** `6-degrees-of` — uncommitted work in flight).
2. `scripts/generate_voter_age_data.py` + README section. Pull **all five cycles**
   (2016/2018/2020/2022/2024), Tables 1 and 4c. Verify against §1, §6, §7, §8 — they should
   reproduce exactly. **If they don't, stop and reconcile before building UI.**
3. Scaffold `src/2026/VoterAge/{index.ts,App.tsx,App.css,types.ts}`, register in `src/routes.ts`
   (`title`, `description`, `group`, `date`, first-person `note` — read neighbours for voice).
4. Beat 1 scatter (`AgeScatter.tsx`) — bins → single years, static first, then scroll wiring.
5. Beat 2 — reuse `AgeScatter` with a year/type toggle, or a five-cycle small-multiples strip.
6. Beat 3 grid (`StateGrid.tsx`) — 51 tiles, pooled presidential-year average, uncertainty visible.
7. Beat 4 — reuse `StateGrid` with mail-status overlay, plus a slope/small-multiples for the
   four groups across 2016/2020/2024.
8. Playwright pass using the persistent `tests/` scaffold (no ad-hoc scroll helpers).
9. `npm run build` — `check-data-files.mjs` fails the build if `voter-age.json` isn't in `dist/`.
   Then OG capture via `scripts/og-recipes.mjs`.

## 11. Open questions

- **Registration vs turnout decomposition.** 18–24 are 58.3% registered / 47.7% voted; 65+ are
  80.3% / 74.7%. Most of the youth gap is a *registration* gap, not a showing-up gap. Only those
  four numbers are verified — good follow-up story, probably not a fifth beat here.
- **Does the midterm collapse differ by state?** Beat 2 × beat 3 crossed. Unverified, and state
  midterm cells are the noisiest in the dataset. Check before promising it.
