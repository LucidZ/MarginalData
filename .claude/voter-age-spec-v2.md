# Voter Participation — Spec v2 (SUPERSEDES v1)

Story working title: **"The Shape of the Electorate"**
Route: `/2026/VoterAge` · Branch: `voter-age-participation` · Group: `Government & Politics`

**Read this instead of `voter-age-spec.md`.** v1 is retained only as the record of two analyses
that were tested and rejected (state-level cross-section, NJ/Montana mail-in natural experiment)
— see §9. Where v1 and v2 disagree, v2 wins.

Every number below was computed from the named source files on 2026-09-16 and is a **verification
target**: the pipeline must reproduce it. Do not retype numbers into the frontend (§8.1).

---

## 1. What changed from v1, and why

v1 was four beats: age gap → midterms → state variation → does mail-in voting help. Three
problems with that, all found by re-examining the data:

1. **Age is only the third-largest gap.** Education is nearly twice as large. v1 built the whole
   story on the smaller finding.
2. **The state beat is ~79% sampling noise** (v1 §7 measured this itself: cross-year r≈+0.46).
   It cost a cartogram, a tile-position table and heavy caveating to deliver one sentence.
3. **The mail-in beat was n=2 and weakly identified.** A published study (Bonica et al. 2021)
   answers the same question with individual voter-file data and far better identification, and
   its subgroup results land on exactly the axes this story is built on.

v2 is also a different chart form. v1's share-of-eligible vs share-of-votes scatter is
analytically precise but needs a paragraph of explanation. v2 puts **counts of people on the
y-axis**, which makes the representation gap a *length* rather than a position-on-a-diagonal.

---

## 2. Premise and arc

Voting is one person, one vote, but turnout isn't uniform — so the electorate that shows up is
not a scale model of the country. Four beats, one chart grammar:

| # | Beat | Question it answers |
|---|---|---|
| 1 | The shape of the electorate (age, 2024) | Who is missing? |
| 2 | Midterms (age, 2022) | When are they most missing? |
| 3 | Education, income, race (2024) | Is it only about age? (No — education is bigger) |
| 4 | Colorado, 2014 (Bonica et al.) | Does anything change it? |

The arc's turn is beat 3. The reader arrives already believing "young people don't vote"; the
payoff is that the education gap is larger, and beat 4 works because every gap the reader has
just seen is a gap all-mail voting moved most.

---

## 3. The chart form (`PopulationBars.tsx`)

**This is the core of the redesign. Build it first and get it right.**

- **x-axis**: age in single years, 18→100 (beats 1–2). Category (beats 3).
- **y-axis**: **number of people.** Not a rate, not a share. One unit throughout the story.
- **Per x position, two nested quantities**:
  - eligible citizens (CVAP) — light fill / outline
  - votes cast — solid fill, drawn from the baseline, always ≤ CVAP so nesting never inverts
- **A dotted reference line** at `CVAP(x) × (that election's overall turnout)` — the
  "if turnout didn't vary by group" counterfactual.

The vertical distance between the solid bar and the dotted line is **votes missing**, readable
directly in people. That is the entire story, encoded as a length.

**The dotted line uses each election's own average** (65.21% for 2024, 51.95% for 2022) — never a
fixed rate across beats. Otherwise the 2022 transition conflates "turnout fell for everyone" with
"the young are underrepresented." Done correctly, both the bars *and* the line drop when the story
moves to 2022, and the visible finding is the young bars falling **further below** the line.

Run the `dataviz` skill before writing chart code. Structural precedent for step-driven chart
modes: `src/2026/MarginalTax/` and `src/2026/DebtSpin/`.

### 3.1 Why counts and not rates
A rate-on-y chart would need width ∝ population so that area = votes, i.e. a Marimekko. Counts on
y make height = votes directly, so the reader compares lengths instead of areas — the easier
perceptual judgment (Cleveland & McGill). Do not "improve" this back into a Marimekko.

### 3.2 Small-multiple readability caveat (beat 3)
With counts on y and wildly unequal group sizes (White non-Hispanic 154.6M eligible vs Asian
12.8M), small groups' bars and gaps are physically tiny. **Keep counts** — do not switch those
panels to rates, which would break the grammar the reader just learned. Instead annotate each bar
with its missing-votes figure. If it still reads badly in a draft, raise it rather than silently
changing the encoding.

---

## 4. Data sources

All public domain, no API key.

### 4.1 CPS November Voting and Registration Supplement (rates)
Base `https://www2.census.gov/programs-surveys/cps/tables/p20/`

| Year | dir | Table 1 (national, single year of age) |
|---|---|---|
| 2024 | 587 | `vote01_2024.xlsx` |
| 2022 | 586 | `vote01_2022.xlsx` |

2024 only, for beat 3 (all under dir `587`):

| Table | File | Dimension |
|---|---|---|
| 2 | `vote02_2024_{1..9}.xlsx` | race / Hispanic origin (one file per group; `A4` names the group) |
| 5 | `vote05_2024_1.xlsx` | educational attainment |
| 7 | `vote07_2024.xlsx` | family income |

Race files map: 1 All Races · 2 White Alone · **3 White Alone, not Hispanic** · **4 Black Alone**
· **5 Asian Alone** · **6 Hispanic (any race)** · 7–9 "alone or in combination". Use 3/4/5/6 (bolded).

### 4.2 Census Population Estimates Program (levels)
`https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/national/asrh/nc-est2024-agesex-res.csv`

One file covers both cycles: columns `POPESTIMATE2022` and `POPESTIMATE2024`. Filter `SEX == '0'`
(both sexes) and drop `AGE == 999` (the total row). **Single years of age run 0–100**, where 100
means "100 and over".

### 4.3 Bonica et al. 2021 (beat 4)
Bonica, A., Grumbach, J.M., Hill, C., & Jefferson, H. (2021). "All-mail voting in Colorado
increases turnout and reduces turnout inequality." *Electoral Studies* 72, 102363.
Open copy: https://pmc.ncbi.nlm.nih.gov/articles/PMC9756790/

**© 2021 Elsevier Ltd, all rights reserved — NOT CC-BY.** Do not reproduce their figures. Extract
the point estimates (facts, not copyrightable) from appendix **Tables A4–A8** and redraw in our
own chart system, with citation. See §7.4 — the numbers in this spec are approximate and **must
be replaced with exact values read from the paper**.

---

## 5. The construction: PEP levels × CPS rates

**This is the methodological core. Implement exactly.**

```
citizen_pop(age, year) = PEP_pop(age, year) × CPS_citizen_share(age, year)
votes(age, year)       = citizen_pop(age, year) × CPS_turnout(age, year)

where  CPS_citizen_share = col3 / col2   (citizen pop / total pop)
       CPS_turnout       = col10 / col3  (reported voted / citizen pop)
```

### 5.1 Why, not just how
Surveys estimate **rates** well and **levels** poorly. Measured year-to-year wobble (mean absolute
deviation from the average of the two neighbouring ages, ages 19–78, 2024):

| series | wobble |
|---|---|
| CPS citizen population (a level) | **5.12%** ← survey noise |
| PEP population (a level) | 1.43% ← real birth-cohort structure |
| CPS citizen share (a rate) | 1.13% |
| CPS turnout (a rate) | 2.74% |

So take levels from PEP and rates from CPS. This is not an unprincipled mixing of datasets: each
individual quantity comes from one source, and each source supplies what it measures well.

It also **dissolves the tail-bucket problem entirely.** CPS stops reporting single years of age at
79 and pools "80-84 years" and "85 years and over" — plotting those pooled rows as if they were
single ages caused the spike-then-cliff bug fixed in September, and the counts-on-y form would
have reintroduced it worse (the pooled 85+ row is 5,646k, taller than *any* single-year bar). PEP
has genuine single-year population to 100, so there is nothing to invent.

### 5.2 Above age 79
Only the **rates** are held flat within each pooled block, because that is all CPS reports:
- ages 80–84 use the `80-84 years` block's citizen share and turnout (75.1% in 2024)
- ages 85–100 use the `85 years and over` block's (68.2% in 2024)

Population shape across those ages is real PEP data. Render ages 80+ in a visually distinct style
and disclose in the method note that single-year turnout is not reported above 79.

### 5.3 Validation (the pipeline must assert these)
Reconstruction vs CPS's own published totals, 2024:

| | CVAP | votes | turnout |
|---|---|---|---|
| CPS as published | 236,138k | 154,308k | 65.3% |
| PEP × CPS rates | 242,052k | 157,849k | 65.21% |
| difference | +2.50% | +2.29% | −0.1pp |

By block: 18–79 **+2.39%** · 80–84 **+0.88%** · 85+ **+9.18%**.

**Assert total turnout is within 0.5pp of CPS's published rate, and that each block is within
+12%.** A larger divergence means a parsing error, not a data finding.

The +9.18% at 85+ is expected and must be footnoted: **PEP counts nursing-home residents; CPS is
household-only** and never measured their turnout. Applying a household turnout rate to ~500k
institutionalized people inflates the 85+ bar ~9%, ≈350k votes ≈ **0.2% of the national total**.
Acceptable and disclosed. Do not attempt a group-quarters correction.

**Do not rake the reconstruction down to CPS's published total.** PEP levels are the more accurate
ones. Instead compute each chart's dotted line from *that chart's own* total and average turnout,
so every gap is internally consistent and the 2.5% base difference never surfaces in a quoted
number. Gaps are ratios and stay comparable across charts despite the different bases.

### 5.4 Parsing gotchas — these will bite you
1. **Table 1 repeats all 62 single-year rows three times**, in `BOTH SEXES` / `MALE` / `FEMALE`
   blocks (col A, rows 6 / 78 / 150 in the 2024 file). A naive scan overwrites the young ages with
   male-only counts and produces a fake structural break at age 52. **Bound the scan to the
   BOTH SEXES block** by locating the next marker row, not by a hardcoded row number.
2. **The tail label is `80-84 years`** — hyphenated, unlike every other bin (`18 to 24 years`).
   Match with a tolerant regex.
3. Match single years with `re.fullmatch(r"\d+ years?")` or you will pick up `75 years and over`
   and double-count.
4. Column indices (0-based) in Table 1: **2** = total population, **3** = total citizen
   population, **10** = reported voted (number). All counts in thousands.
5. Header/data start rows drift between years — locate by content, never by fixed offset.
6. **Assert 62 single-year rows and both tail blocks per year.** A silent label change must fail
   the build.

---

## 6. Pipeline — `scripts/generate_voter_age_data.py`

Rewrite the existing script. Keep its conventions (argparse, module docstring, cached raw
downloads under `data/voter_age/`, writes to `public/data/`). Update `scripts/README.md`.

Existing v1 parsing logic for Table 1 is correct on the BOTH SEXES bounding — preserve that, do
not rewrite it from scratch.

Output `public/data/voter-age.json`:

```jsonc
{
  "meta": {
    "sources": [...], "retrieved": "...",
    "units": "thousands of people",
    "construction": "PEP single-year population x CPS citizen share x CPS turnout",
    "validation": { "2024": { "reconTurnout": 65.21, "cpsTurnout": 65.3,
                              "reconVotes": 157849, "cpsVotes": 154308 } }
  },
  "byAge": {
    "2024": {
      "avgTurnout": 65.21, "totalCvap": 242052, "totalVotes": 157849, "crossoverAge": 40,
      "rows": [ { "age": 18, "cvap": 4267.6, "votes": 1589.6, "expected": 2782.9,
                  "turnout": 37.2, "ratesPooled": false } ]
    },
    "2022": { ... }
  },
  "byDimension": {
    "education": {
      "label": "Educational attainment", "avgTurnout": 65.3,
      "note": null,
      "rows": [ { "group": "Less than 9th grade", "cvap": 3998, "votes": 1233,
                  "expected": 2613, "missing": -1380, "turnout": 30.8 } ]
    },
    "income": { "note": "family members with reported income only — see 8.4", ... },
    "race":   { ... }
  },
  "colorado": { "overall": 8.0, "subgroups": { "age": [...], "education": [...], ... } }
}
```

`expected = cvap × avgTurnout`, `missing = votes − expected`, both computed in the script.
`ratesPooled: true` for ages ≥ 80 so the frontend can style and caption them.

**Beat 3 uses CPS levels directly** (no PEP — it doesn't break out by education/income/race).
That's fine: those categories hold millions each, so survey noise is negligible, unlike
single-year-of-age cells.

---

## 7. Beats

### 7.1 Beat 1 — the shape of the electorate (age, 2024)
Sticky `PopulationBars`, accumulating:
1. Population bars alone, 18→100. "There are more 25-year-olds than 75-year-olds."
2. Votes-cast bars fill in underneath.
3. Dotted line appears at 65.21%. Bars below it are short of proportional.
4. Shade the under-40 deficit and the over-40 surplus; crossover at **40**.
5. Count reveal: **under-35s cast 8.5M fewer votes than proportional turnout would give them;
   65+ cast 5.5M more.**

### 7.2 Beat 2 — midterms (age, 2022)
Same chart, transition to 2022. Both bars and the dotted line drop. The finding is the young bars
falling further below the line: the under-35 shortfall grows from **−8.5M to −11.9M**.

The mechanism is the payoff and the single-year resolution shows it cleanly:

| age | turnout 2024 | turnout 2022 | change |
|---|---|---|---|
| 18 | 37.2% | 19.6% | **−17.6** |
| 22 | 53.1% | 29.9% | **−23.3** |
| 65 | 72.4% | 67.4% | −5.1 |
| 79 | 74.5% | 69.7% | −4.8 |

Young turnout nearly halves; old turnout barely moves. Optional support: a five-cycle strip
(2016/2018/2020/2022/2024) of under-35 vs 65+ turnout **rates only** — CPS-only, no PEP needed.

### 7.3 Beat 3 — it isn't only age
Three or four small multiples in the same grammar, 2024. **Education first** — it's the largest
and it's the turn in the story.

Ordering by size of gap (2024, missing votes vs a 65.3% counterfactual):

| dimension | group short of the line | missing |
|---|---|---|
| **Education** | high school or less | **−13,372k** (bachelor's+ = +12,069k) |
| Age | under 35 | −8,455k |
| Race | Hispanic −4,838k · Black −1,790k · Asian −1,060k | (White NH +7,910k) |
| Income | under $50k | −4,846k |

Turnout spreads: education **30.8%→82.5%** (51.7pp) · income 44.5%→80.4% (35.9pp) · age
47.7%→75.2% (27.5pp) · race 50.6%→70.5% (19.9pp).

**Race needs a residual bar.** The four standard categories cover 98.0% of CVAP; add
"Other / multiple races" (4,802k eligible, 2,916k votes) so the bars account for everyone.

**State-level variation is one sentence of prose, no chart:** all 51 jurisdictions had a negative
under-35 gap in 2024, from DC (−0.74) to Oklahoma (−8.17). Do not build a map (§9).

### 7.4 Beat 4 — Colorado, 2014
Colorado moved to all-mail voting in 2014. Bonica et al. tracked individual voters with the L2
voter file, matched exactly on birth year and pre-2012 turnout history, difference-in-differences
within individuals, validated against control states (AZ, NV, NM) and CPS.

Overall effect ≈ **+8pp**, ≈900,000 additional ballots 2014–2018. Subgroup effects —
**APPROXIMATE, replace with exact values from appendix Tables A4–A8**:

| axis | group | effect |
|---|---|---|
| Age | born after 1980 | +10.1pp (largest cohort effect) |
| Education | no HS diploma → graduate degree | +8.5pp → +5.9pp |
| Income | lowest bracket | +8.4pp, declining across brackets |
| Race | Asian / Black / Latino / White | +10.0 / +9.3 / +8.9 / +7.6 |

The point is the **rhyme**: the groups the reader has just watched fall short of the dotted line
are the groups that gained most. Redraw as a single dot-plot per axis, in our own chart system.

**Three caveats, in the prose and not only a footnote:**
1. **Colorado adopted same-day registration at the same time.** The authors address it by
   excluding voters registered after 2010, which removes the direct channel, but they concede a
   residual indirect effect. State this — it is the main confound.
2. **n = 1 state**, with unusually high baseline civic engagement. External validity is open.
3. **A uniform turnout boost mechanically compresses relative inequality**, since low-turnout
   groups start lower. The real claim is the *differential* (10.1 vs ~6), so show the
   differential and do not repeat the headline uncritically.

Close on the honest verdict: well-identified for Colorado, suggestive for everywhere else.

---

## 8. Integrity guardrails

1. **No hand-typed numbers in the frontend.** Every figure in prose comes from the JSON via a
   formatter, or a build-time constant from the pipeline.
2. **Eligible = citizen voting-age population**, never total voting-age population — otherwise the
   age gap is confounded with non-citizen share.
3. **CPS turnout is self-reported and overstates turnout**, and the overstatement is differential
   by group, so it does not fully cancel. One sentence in the method note; link
   [electproject's correction](https://www.electproject.org/election-data/cps-vote-over-report-and-non-response-bias-correction)
   and Hur & Achen (2013).
4. **Income carries a universe caveat.** Table 7 covers *family members only* (168,851k of
   236,138k CVAP = 71.5%), and 16.7% of those don't report income, so usable coverage is **59.6%
   of eligible adults**. The excluded people — living alone, unrelated individuals — skew young,
   poor and low-turnout, so the true gradient is probably **steeper** than shown. Income's
   counterfactual uses its own restricted-universe average (**70.7%**), not the national 65.3%.
   Keep the dimension; caption the caveat.
5. **This story is descriptive, not causal.** Age, education, income and race are heavily
   correlated with each other; the education gap is not a pure education effect. Say so explicitly
   once, early. The point is that misrepresentation shows up on more than one axis, not that any
   one of them is the mechanism.
6. **Never describe beat 4 as proof.** "Consistent with", "the pattern you'd expect if". Never
   "caused".
7. Use the existing `Footnotes.tsx` / `Sources.tsx`; list every Census table and the paper.

---

## 9. Delete

Remove, with their imports and CSS:
- `Beat3.tsx`, `StateGrid.tsx`, `stateGridPositions.ts` — the cartogram. v1 §7 measured
  cross-year correlation at r≈+0.46, i.e. ~79% of between-state variance is sampling noise, and
  median CPS MOE on a state's 18–24 turnout is ±8.4pp against a between-state SD of 1.68pp.
- `Beat4.tsx`, `MailTrend.tsx` — the NJ/Montana natural experiment (n=2), superseded by §7.4.
- `AgeScatter.tsx` — replaced by `PopulationBars.tsx`.
- The `derived` block in the pipeline (Welch's t, mean-reversion OLS, placebo) and the state
  parsing (Table 4c), unless the one prose sentence in §7.3 needs the min/max, in which case keep
  a minimal state gap computation and drop the rest.

`stateGridPositions.ts` was generated by snapping real centroids to a grid with a local-radius
collision resolver — **worth preserving in git history** for any future US tile-grid map, but it
should not ship in this story.

---

## 10. Build steps

1. Work in the existing worktree `../MarginalData-voter-age` on `voter-age-participation`.
2. Rewrite `scripts/generate_voter_age_data.py`: PEP + CPS Tables 1/2/5/7, the §5 construction,
   the §5.3 assertions, §5.4 parsing guards. **Verify against §5.3 and §11 before building any
   UI. If the numbers don't reproduce, stop and reconcile.**
3. Build `PopulationBars.tsx` static, 2024 only, and eyeball it before wiring scroll.
4. Beat 1, then beat 2 as a transition on the same component.
5. Beat 3 small multiples — check the §3.2 readability problem in a real draft.
6. Beat 4: extract exact estimates from the paper's appendix tables, then a dot-plot per axis.
7. Rewrite the header/intro copy — "The Electorate Is Older Than the Country" is now too narrow a
   title for a story whose biggest gap is education.
8. Playwright pass using the persistent `tests/` scaffold — do not write ad-hoc scroll helpers.
   Update `tests/voter-age-smoke.mjs` and `voter-age-dark.mjs`. Check **both themes**: v1 shipped a
   bug where shared colour classes set SVG `fill` only, so `<div>`-based marks rendered with no
   background.
9. `npm run build` (`check-data-files.mjs` fails if `voter-age.json` isn't in `dist/`), then OG
   capture via `scripts/og-recipes.mjs`.

---

## 11. Verification targets

The pipeline must reproduce all of these.

**2024** — CVAP 242,052k · votes 157,849k · avg turnout **65.21%** · crossover age **40**

Single-row join check (catches a bad PEP merge immediately): **age 18, 2024** — PEP population
4,484.1k × CPS citizen share 0.9517 = CVAP **4,267.6k**; × CPS turnout 37.2% = **1,589.6k** votes;
expected at 65.21% = **2,782.9k**.

| group | cvap | votes | expected | missing | turnout |
|---|---|---|---|---|---|
| under 35 | 69,599k | 36,933k | 45,388k | **−8,455k** | 53.1% |
| 35–64 | 113,725k | 77,091k | 74,163k | +2,928k | 67.8% |
| 65+ | 58,728k | 43,826k | 38,298k | +5,527k | 74.6% |

**2022** — CVAP 238,206k · votes 123,739k · avg turnout **51.95%** · crossover age **40**

| group | cvap | votes | expected | missing | turnout |
|---|---|---|---|---|---|
| under 35 | 68,638k | 23,731k | 35,655k | **−11,925k** | 34.6% |
| 35–64 | 113,999k | 62,892k | 59,218k | +3,674k | 55.2% |
| 65+ | 55,569k | 37,116k | 28,866k | +8,250k | 66.8% |

**Education, 2024** (CPS levels, counterfactual 65.3%)

| group | cvap | votes | missing | turnout |
|---|---|---|---|---|
| Less than 9th grade | 3,998 | 1,233 | −1,380 | 30.8% |
| 9th–12th, no diploma | 12,294 | 4,704 | −3,330 | 38.3% |
| High school graduate | 67,643 | 35,540 | −8,662 | 52.5% |
| Some college / associate's | 64,672 | 43,564 | +1,303 | 67.4% |
| Bachelor's degree | 55,578 | 42,900 | +6,582 | 77.2% |
| Advanced degree | 31,953 | 26,367 | +5,487 | 82.5% |

High school or less **−13,372k** · bachelor's or more **+12,069k**.

**Race / ethnicity, 2024** (counterfactual 65.3%)

| group | cvap | votes | missing | turnout |
|---|---|---|---|---|
| White alone, not Hispanic | 154,575 | 108,919 | +7,910 | 70.5% |
| Black alone | 31,221 | 18,612 | −1,790 | 59.6% |
| Asian alone | 12,775 | 7,288 | −1,060 | 57.0% |
| Hispanic (any race) | 32,765 | 16,573 | −4,838 | 50.6% |
| Other / multiple (residual) | 4,802 | 2,916 | −222 | 60.7% |

**Income, 2024** (restricted universe, counterfactual **70.7%**)

| group | cvap | votes | missing | turnout |
|---|---|---|---|---|
| Under $10,000 | 2,467 | 1,098 | −646 | 44.5% |
| $10,000–14,999 | 1,935 | 948 | −420 | 49.0% |
| $15,000–19,999 | 1,484 | 667 | −382 | 44.9% |
| $20,000–29,999 | 5,774 | 2,875 | −1,207 | 49.8% |
| $30,000–39,999 | 8,975 | 4,763 | −1,582 | 53.1% |
| $40,000–49,999 | 7,401 | 4,624 | −609 | 62.5% |
| $50,000–74,999 | 22,075 | 14,956 | −651 | 67.8% |
| $75,000–99,999 | 20,065 | 14,259 | +73 | 71.1% |
| $100,000–149,999 | 28,698 | 21,673 | +1,383 | 75.5% |
| $150,000 and over | 41,806 | 33,598 | +4,041 | 80.4% |

Under $50k **−4,846k**.

---

## 12. Open questions

- **Registration vs turnout.** 18–24 are 58.3% registered / 47.7% voted; 65+ are 80.3% / 74.7%.
  So ~82% of registered under-25s vote vs ~93% of registered 65+ — most of the youth gap is a
  *registration* gap, not a showing-up gap. This is directly relevant to beat 4 (Colorado's
  same-day registration confound) and might deserve a sentence there. Only those four numbers are
  verified. A full decomposition is a separate story, not a fifth beat.
- **Does income survive a draft?** §8.4's caveat is real. If the caption becomes longer than the
  panel is informative, cutting to three dimensions is acceptable — but the decision is the
  author's, not Sonnet's. Flag, don't cut.
