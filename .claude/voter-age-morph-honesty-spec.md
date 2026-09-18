# VoterAge Beat 2 v2: a morph that never prints a number that didn't happen

**§3's pinned-benchmark decision was reverted 2026-09-18** per author direction
after using the shipped page: the presidential and midterm charts should look
identical, the same single-line design as Beat 1. The dotted line is no
longer pinned at 74.62% — it now traces each cycle's own 65+ rate (74.62% at
t=0, 66.79% at t=1), and `expected2`/the second dotted line/`showExpected2`
were removed from `PopulationBars` entirely (they had no other caller). The
gold shortfall is measured against each cycle's own standard again: 23.3M
(2024, unchanged) and **36.1M** (2022, not 54.0M). Everything else below —
the three-channel split, the eased eventual `t`/linear `u`, snap-not-lerp for
printed numbers, the hero gold number, the year stamp — stands unchanged.
Treat §3, §4b/4d's pinning language, and the "New: the year stamp"/§7's
54.0M figure as historical context for *why* the two-line version existed,
not as the current design.

**Beats 1 and 2 were merged 2026-09-18.** `Beat1.tsx` and `Beat2.tsx` are now
one component, `AgeBeats.tsx`: a single `<section>` with one `StickyViz` and
one `PopulationBars` spanning nine steps (0-5 = beat 1's layer reveals off a
rounded step index, 6-8 = this morph off the raw scroll fraction), with beat
2's `<h2>` moved inside the text column. Two sticky panes meant the 2024
chart scrolled away at the end of beat 1 only for an identical 2024 chart to
scroll back in under beat 2's heading. The morph's own mechanics are
unchanged — `u`/`t`/snapped-labels all still hold — but every `Beat2.tsx:NN`
line reference below is historical; read it in `AgeBeats.tsx`. The morph
window is now `progress` 6.15 → 6.85 rather than 0.15 → 0.85, and the
y-domain and the hero gold figure are shared with beat 1 (the figure is
mounted from first paint and fades in at step 4, so the merged chart's height
never changes).

Implementation brief. Scope: `src/2026/VoterAge/` in the `voter-age-participation`
worktree (`/Users/lucas/code/MarginalData-voter-age`).

**This supersedes `.claude/voter-age-scroll-morph-spec.md`** on two of its
acceptance criteria. That spec asked for legend percentages that "count
continuously; they never jump" and a national-average line that fades in.
Both are reversed here. Everything else in that spec — the continuous
`useStepProgress` fraction, `transitionMs={0}`, the fixed `yDomain` — stands
and must not be undone.

---

## 1. The problem

Beat 2's chart is a pure function of scroll, and *every* quantity is
`lerp(2024, 2022, t)` — including the printed ones. Mid-scroll the chart
renders, in bold, three statistics that describe no election that ever
happened:

| Readout | At t≈0.5 | Real 2024 | Real 2022 |
|---|---|---|---|
| 65+ benchmark rate | **71.3%** | 74.62% | 66.79% |
| Missing votes | **28.6M** | 23.3M | 36.1M |
| Share of ballots | **19.9%** | 14.8% | 29.2% |

A reader can park there, screenshot it, and quote it. A time-driven tween
would not have fixed this — frame 12 of a 700ms tween is the same fabricated
electorate with the same label on it. The fix is not to remove the continuous
motion. It is to separate the channels:

> **Geometry interpolates continuously. Numbers never interpolate — they snap.
> One element, the year stamp, is allowed to show betweenness, because a
> cross-fade of two labels asserts no third value.**

---

## 2. The three channels

Each does exactly one job. Do not unify them.

| Channel | Driven by | Why |
|---|---|---|
| Bar/line geometry | eased `t` (steep) | fast crossing = little time spent between states |
| Bar **position** | eased `t` (same clock as height) | geometry, so position and height must move as one object, never on different curves |
| Year stamp cross-fade | raw `u` (linear) | slow and legible = tells the reader *where they are* in the transition |
| All printed numbers | `t < 0.5 ? 2024 : 2022` | never fabricated |

**Addendum, 2026-09-18 — the cohort slide.** `.claude/voter-age-cohort-slide-spec.md`
extends this document with the fourth channel above: as of that spec, each bar also
slides two age-slots left during the 2024→2022 morph (same cohort, two years
younger), fading out the two cohorts (2024 ages 18-19) that have no 2022
counterpart. Every rule in this document still governs it — geometry (now
including position) interpolates on `t`, numbers snap, nothing mounts mid-flight.
Read that spec for the pairing/positioning mechanics.

The year stamp on the *linear* fraction is the deliberate part: it is the
progress indicator. It begins moving the instant the morph begins and settles
exactly when it completes, which is the "when does this start/end" problem
the whole change exists to solve. The geometry, meanwhile, has already
snapped through.

---

## 3. Pin the benchmark — and know what it costs

**Decision (author, confirmed):** the primary dotted line is pinned at the
**2024 65+ rate (74.62%) permanently**. It is the gold standard: the best
turnout any age group achieves in the best year. It no longer moves.

A **second dotted line** is added at the **2022 65+ rate (66.79%)** to show
that even 65-and-overs slip in a midterm. The two lines are roughly parallel;
no collision handling needed.

### ⚠ This changes the headline number. Surface it to the author before shipping.

The gold shading is keyed to `expected`. Pinning `expected` at 74.62% means
2022's shortfall is now measured against 2024's standard, not its own:

| | vs. own-year 65+ rate (old) | vs. pinned 74.62% (new) |
|---|---|---|
| 2024 | 23.3M · 14.8% of ballots | **23.3M · 14.7%** (unchanged — same rate) |
| 2022 | 36.1M · 29.2% of ballots | **54.0M · 43.6%** |
| Delta | +12.8M | **+30.7M** |

2024 is untouched, so **Beat 1 needs no changes**. 2022's gold number nearly
doubles. This is defensible and arguably stronger — "votes short of the
standard the most reliable voters set" — but it is a different claim than the
current copy makes, and the copy must say it explicitly.

### The national-average line is removed

`expected2` currently carries the 2022 national average (51.95%). It is
replaced by the 2022 65+ rate. Rationale: the author asked to *reduce*
on-page elements, and three dotted lines on one chart is too many.
`expected2` is used only by Beat 2 (`grep` confirms Beat 1/3/4 don't touch
it), so this is contained. **Flag this to the author** — it is the one
substantive thing being deleted rather than changed.

---

## 4. Changes to `Beat2.tsx`

### 4a. Ease

Keep the existing offset window, rename its output to `u`, then steepen:

```ts
// Raw scroll fraction across the morph window: 0 = 2024 settled,
// 1 = 2022 settled. Drives the year stamp, which wants to be linear.
const u = clamp01((progress - 0.15) / 0.7);

// Steepened ease-in-out for geometry. Flat shoulders, fast middle, so the
// chart rests at the two real states and crosses between them quickly -
// a reader can still stop and reverse anywhere, it just takes intent.
// Tune gamma; 3 puts most of the change in the middle third.
const ease = (x: number, gamma = 3) =>
  x < 0.5 ? Math.pow(2 * x, gamma) / 2 : 1 - Math.pow(2 * (1 - x), gamma) / 2;
const t = ease(u);
```

### 4b. Derive, don't retype

Per `voter-age-spec.md` §7, no figure from §3 above may be hardcoded. Take
the benchmark from the data and recompute `expected`/`missing` in the
component, since the JSON's precomputed `missing` is keyed to each year's own
rate and is now wrong for 2022:

```ts
const BENCH = cycle2024.over65Turnout;   // 74.62 - the pinned gold standard
const BENCH_2022 = cycle2022.over65Turnout; // 66.79 - the comparison line

// sign convention matches PopulationBars: missing < 0 means short
const pin = (r: AgeRow) => ({
  expected:  (r.cvap * BENCH) / 100,
  expected2: (r.cvap * BENCH_2022) / 100,
  missing:   r.votes - (r.cvap * BENCH) / 100,
});
```

Apply `pin()` to **both** `rows2024` and `rows2022` before lerping, so the
two endpoints are measured on the same ruler. `toBarRow`'s `expected2:
(cvap * avgTurnout) / 100` goes away.

Then lerp `cvap`, `votes`, `expected`, `expected2`, `missing`, `turnout` on
`t` exactly as today.

### 4c. Snap the readouts

```ts
const shown = t < 0.5 ? cycle2024 : cycle2022;  // which year the LABELS describe
```

Everything printed reads from `shown` (or from a summary computed off
`shown.rows` with `pin()` applied) — never from the lerped `activeRows`.

The two line labels are now **static strings** (74.62% and 66.79% never
change), which means the legend never reflows at all. Keep them static.

### 4d. Both lines visible from the start

`showExpected2` becomes permanently true, `expected2Opacity` ramps 0→1 on
`t` only as a *fade*, never as a mount. See §5.

---

## 5. Changes to `PopulationBars.tsx` — reserve space, never remount

The author's note: *"when features pop in it jolts the graph by moving stuff
around."* Fix the cause, not the symptom. Today the legend entries and the
gap summary are **conditionally mounted** (`{legendExpected2Opacity > 0.01 &&
(...)}` at ~L413, `{(showGapSummary ?? showGap) && (...)}` at ~L432). Mounting
changes layout; layout change moves the SVG; the chart jolts. Also, the legend
wraps to two lines — so an entry appearing can change the *wrap point*, which
is the worst version of the jolt.

**Rule: every element in the finished chart is mounted from first paint and
occupies its final space. Only `opacity` ever animates.**

- Replace all three conditional legend blocks with always-rendered spans
  whose `style={{ opacity: ... }}` is 0 when inactive. Do **not** use
  `display: none` or `visibility: hidden` for the legend — opacity 0 is
  required because the entries must hold their width to freeze the wrap point.
- Same for `.pb-gap-summary`.
- Add `font-variant-numeric: tabular-nums` to `.pb-gap-summary` and the
  legend percentages in `App.css` so digit-width changes can't nudge anything
  when the numbers snap.
- Set `aria-hidden="true"` on any element at opacity 0, and don't let
  zero-opacity legend entries take pointer events.

Sanity check while implementing: at t=0 the chart's total height must be
byte-identical to its height at t=1.

---

## 6. New: the year stamp

A large year label in the chart's plot area (top-right of the plot, clear of
the ~4.0M bar tops — see the reference screenshot; if it collides, top-left
inside the left margin is fine).

- Two absolutely-positioned `<span>`s in the same grid cell so they don't
  affect layout: `2024` at `opacity: 1 - u`, `2022` at `opacity: u`.
- Driven by **raw `u`**, not `t`. This is intentional (§2).
- Large and quiet: ~2rem, heavy weight, low-contrast muted color — a
  watermark, not a headline. It must lose to the gold number.
- Prefers-reduced-motion: no change needed, opacity tracks scroll position
  rather than animating on a timer.

---

## 7. New: the big gold number

Replaces — does not supplement — the current `.pb-gap-summary` text line.
Element count stays flat.

```
        54.0M
  votes short of the 2024 standard
        +30.7M vs 2024
```

- The large figure is `shown`'s real total shortfall vs. the pinned
  benchmark: 23.3M at t<0.5, 54.0M at t≥0.5. **Snaps.** Derived, not typed.
- The `+30.7M vs 2024` delta line appears only at `t` ≈ 1 (fade in over the
  last ~15% of the morph). Its height is reserved from first paint (§5) so
  its arrival moves nothing.
- Gold (`--voa-gold` or whatever `.pb-gap-marker` uses) and the largest type
  in the chart surface.
- Keep this behind the existing `showGapSummary` prop so Beats 3/4 are
  unaffected; the new big treatment can be a variant flag, e.g.
  `gapSummaryVariant?: "line" | "hero"`.

---

## 8. Copy rewrite — draft, needs author approval

The current step-1 copy is now factually wrong and must not ship as-is:

- ❌ *"the dotted line drops a little too — because it's set to that year's
  65+ turnout"* — the line no longer drops.
- ❌ *"The second, orange dotted line shows a lower bar: what each age group
  would need to hit to match 52.0%, the national average"* — that line is gone.

Draft replacement for step 1:

> **2022: the bars fall, the standard doesn't**
>
> The dotted line stays exactly where it was. It marks the 74.6% that
> 65-and-overs hit in 2024 — the best any age group manages in the best year,
> and the fairest standard we have for what full participation looks like.
>
> Watch what the bars do against it. A second line drops in at 66.8%: that's
> what 65-and-overs themselves managed in 2022. Even the most reliable voters
> in the country slip in a midterm — but only by eight points. The young bars
> fall off a cliff.

And the gold callout becomes: **23.3M → 54.0M votes short of the 2024
standard.**

Leave step 2 (the turnout comparison table) alone; it is unaffected.

---

## 9. Out of scope

Beat 1, Beat 3, Beat 4, `ColoradoDots`, `StickyViz` positioning, the data
pipeline, `public/data/voter-age.json`. No ghost/outline bars (explicitly
declined — the morph itself carries direction). No dual "2024: x · 2022: y"
footer (declined as confusing). No scrubber widget, no play/pause.

---

## 10. Verification

Use the existing scaffold in `tests/` — `beat2-morph.mjs` already drives this
beat. Extend it; do not write new ad-hoc scroll helpers.

- [ ] No printed number anywhere in Beat 2 takes a value that isn't 2024's or
      2022's. Assert this by sampling `u` at 0.1 … 0.9 and checking the legend
      and gold figure against a two-element allowlist at every sample.
- [ ] Chart surface height at t=0 === height at t=1. No element mounts or
      unmounts across the whole morph — assert a stable DOM node count.
- [ ] The primary dotted line's y-pixels for a fixed age are identical at t=0
      and t=1 (the benchmark is pinned; only the bars move).
- [ ] Year stamp: `2024` opaque at u=0, `2022` opaque at u=1, both partly
      visible at u=0.5.
- [ ] Gold number reads 23.3M before the midpoint, 54.0M after; the `+30.7M`
      delta line is invisible until the very end.
- [ ] Reversing the scroll retraces exactly — same position, same frame.
- [ ] Beats 1, 3, 4 pixel-unchanged (`tests/gap-shots.mjs`, `beat1-steps.mjs`).
- [ ] `tsc --noEmit`, lint, and build clean. Dark mode checked
      (`voter-age-dark.mjs`).

## 11. Order of work

1. §4a ease + §4b pinned benchmark. Look at it — the gold wedge gets much
   bigger in 2022. Confirm with the author that this reads well before going on.
2. §5 space reservation. Pure refactor, no visual change at rest.
3. §4c/§4d snapping + second line.
4. §6 year stamp.
5. §7 gold number.
6. §8 copy.
