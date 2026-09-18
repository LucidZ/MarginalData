# VoterAge Beat 2 v3: the cohort slide

**Status:** implementation brief, ready to execute. Author-approved 2026-09-18.
**Scope:** `src/2026/VoterAge/` in the `voter-age-participation` worktree
(`/Users/lucas/code/MarginalData-voter-age`). Two source files change
(`PopulationBars.tsx`, `AgeBeats.tsx`) plus copy and one new test.

**Relationship to the existing specs.** This *extends*
`.claude/voter-age-morph-honesty-spec.md`; it does not supersede it. Every
rule in that document still holds — geometry interpolates, printed numbers
snap, nothing mounts mid-flight, `yDomain` stays pinned, `transitionMs={0}`
once scroll-driven. This adds one new geometry channel. Read that spec first
if you haven't.

---

## 1. What changes, in one sentence

During the 2024 → 2022 morph, each bar **slides two age-slots to the left**
while it changes height, so the bar that was the 40-year-olds of 2024 ends up
in the age-38 slot carrying 2022's age-38 values — the same people, two years
earlier.

## 2. Why

Today the bars change height in place. That reads as "the age-40 bar got
shorter," which is ambiguous: did the population change, or the turnout? The
slide says something specific instead — *these are the same humans, rewound
two years* — and it makes the motion itself carry the idea of a cohort moving
through time rather than a table of numbers being swapped out.

**The author's framing, which governs every judgement call below:** the start
state and end state are real data; everything in between is art that conveys
a concept. Where this spec chooses smoothness over literal correctness for an
intermediate frame, that is deliberate and does not need re-litigating. What
is *not* negotiable is that t=0 is the true 2024 chart and t=1 is the true
2022 chart, and that no label ever prints an interpolated number.

## 3. What does NOT change

- **The end state.** At t=1 the chart is the same 2022-by-age chart it is
  today: slot 38 holds 2022's age-38 data. Only the path there differs.
- **The x-axis.** It stays fixed. It is the reference frame the bars move
  against — if it slid too, nothing would appear to move. Do not touch the
  tick logic in `PopulationBars.tsx:150-178`.
- **Every printed number.** `shortfall2024` / `shortfall2022` / the hero
  figure / the benchmark percentages / the compare table all still read from
  the full, real `cycle2024` and `cycle2022` and still snap at `t >= 0.5`.
- **The `u` / `t` split**, the ease, the year stamp, the `yDomain`, the
  `transitionMs` cutoff. Untouched.
- **Beats 1, 3, 4.** Beat 1 is the same chart at t=0, so it must render
  byte-identically to today. Beats 3 and 4 use the `category` variant, which
  this change must not touch at all.

## 4. The new channel

Add a fourth row to the channel table in the honesty spec §2:

| Channel | Driven by | Why |
|---|---|---|
| Bar **position** | eased `t` | geometry, same clock as height — position and height must move as one object, never on different curves |

Position is geometry. It follows `t`, not `u`. Do not give it its own ease.

## 5. Cohort pairing

`SHIFT_YEARS = 2`. Bar identity is the **cohort**, not the age: key
`age-${a}` means "the people who were `a` years old in 2024."

| Bar (2024 age) | starts at slot | ends at slot | takes the values of |
|---|---|---|---|
| 20 … 100 | 20 … 100 | 18 … 98 | 2022 age 18 … 98 |
| 18, 19 | 18, 19 | 16, 17 (off-plot) | — (see §5.1) |
| — | — | 99, 100 | not drawn (see §5.2) |

Keys must stay 2024-indexed for the whole morph. That is what makes d3 animate
each bar as one continuous element rather than tearing down and rebuilding the
join. Do not re-key at t=1.

### 5.1 The two bars that leave

2024's 18- and 19-year-olds were 16 and 17 in 2022 — not eligible, no 2022
row exists, and inventing one would be the exact fabrication the honesty spec
forbids. So they **slide off the left edge and fade out**:

- They keep their 2024 heights on the way out. Nobody reads the height of a
  bar that is 30% opaque and halfway under the y-axis, and holding real 2024
  values is strictly more honest than lerping toward something made up.
- Opacity: `clamp01(1 - t / 0.4)` — gone by the time the morph is 40% through,
  well before they would collide with the y-axis line.
- They stay in the `rows` array (and therefore in the dotted line's datum) for
  the whole morph. A clip path handles the rest. Do not filter them out: the
  array must stay index-stable, and removing them would make the line's
  leftmost point pop.

This is a *feature* of the concept, not damage to work around — "2024's
18-year-olds weren't eligible two years ago" is true and worth one line of
copy (§8).

### 5.2 The two slots that are left empty

At t=1 nothing occupies slots 99 and 100 (they would need 2024 ages 101 and
102). **Leave them empty. Do not synthesise entering bars.**

Justification, so nobody files this as a bug later: 2022 ages 99 and 100 have
cvap 49k and 81k against a y-domain top of ~4,400k. Those bars are ~1px tall
and the dotted line above them is ~1px off the baseline. The gold they
contribute is 0.013M out of 36.1M. The hero figure stays the full-year 36.1M;
the two undrawn sub-pixel bars are a rendering omission, not a change to the
statistic. Put a comment saying exactly this where the pairing is built.

### 5.3 Direction

Forward scroll (2024 → 2022) slides bars **left**; scrolling back up slides
them right. Left-on-the-way-down is correct — it is a rewind, and it matches
the year stamp counting down. Do not "fix" it to feel like aging-forward.

## 6. `PopulationBars.tsx`

Three additions. All three must be no-ops when the new props are absent, so
the `category` variant and beat 1 are untouched.

### 6.1 Continuous x position

`scaleBand` with a fixed, contiguous domain has a constant `step()`, so a bar
can be placed at a *fractional* domain position without leaving the scale's
grid. Add to `PopulationBarRow`:

```ts
  /** "age" variant only - continuous position on the age axis, for a bar
   * that is mid-slide between two age slots (VoterAge's cohort morph).
   * Defaults to the row's own `x`, which is what every static chart wants. */
  xPos?: number;
  /** Per-row opacity multiplier, 0-1. Defaults to 1. Used by the cohort
   * morph to fade out bars that have no counterpart in the target year. */
  opacity?: number;
```

In the d3 effect, just after `xScale` is built (`PopulationBars.tsx:122-126`):

```ts
    // Uniform band geometry: with a contiguous domain, slot i sits at
    // x0 + i*step, so a fractional age lands exactly between two slots and
    // an integer age lands exactly on xScale(key). Lets a bar animate
    // *between* slots without leaving the scale.
    const x0 = xScale(domainKeys[0]) ?? 0;
    const ageLo = xKind === "age" ? Math.min(...rows.map((r) => Number(r.x))) : 0;
    const xOf = (d: PopulationBarRow) =>
      xKind === "age" ? x0 + ((d.xPos ?? Number(d.x)) - ageLo) * xScale.step() : xScale(d.key) ?? 0;
```

Replace every `xScale(d.key) ?? 0` **in the bar/gap/line/hit code** with
`xOf(d)`:
`PopulationBars.tsx:209, 217, 235, 243, 262, 270, 286, 337`.
Leave `301, 302` (`pb-expected-tick`, category-only) and `321`
(`pb-missing-label`, category-only) alone — `xOf` returns the same value
there anyway, but touching them buys nothing.

Assert contiguity once, so a future data change can't silently produce a
scrambled chart:

```ts
    // xOf's arithmetic assumes slot i == ageLo + i. Single years of age are
    // contiguous today; if that ever stops being true this must become a
    // lookup, and failing loudly beats drawing a scrambled chart.
    if (import.meta.env.DEV && xKind === "age") {
      console.assert(
        rows.every((r, i) => Number(r.x) === ageLo + i),
        "PopulationBars: age rows must be contiguous single years for xOf()"
      );
    }
```

### 6.2 Per-row opacity

Every place that currently does `.style("opacity", showTrack ? 1 : 0)` (and
the votes/gaps equivalents at `PopulationBars.tsx:213, 240, 267`) multiplies
in the row's own value:

```ts
      .style("opacity", (d: PopulationBarRow) => (showTrack ? 1 : 0) * (d.opacity ?? 1))
```

Note these are on the *merged* selection outside `anim()`, i.e. they are set
instantly rather than tweened — which is what we want, since opacity here is
scroll-driven like everything else in the morph.

The dotted line keeps a single opacity (`showExpected ? 1 : 0`); it is one
path, and its left tail is handled by clipping.

### 6.3 Clip the data layer

Bars sliding past x=0 must be cut at the y-axis, not drawn over it.

- `useId()` for a unique clip id (multiple `PopulationBars` mount on this
  page — beats 3 and 4 — so a hardcoded id would collide).
- On first build, `root.append("clipPath").attr("id", clipId).append("rect")`,
  and wrap the five data groups in a `g.pb-clipped` carrying
  `clip-path: url(#${clipId})`: `pb-tracks`, `pb-votes`, `pb-gaps`,
  `pb-expected-line`, `pb-hits`.
- **Outside** the clip: both axes, the y-axis label, `pb-expected-ticks`,
  `pb-missing-labels`. Clipping an axis would chop its tick labels.
- Rect geometry, updated every run: `x: 0, y: -2, width: innerW, height: innerH + 2`.
  The `-2` gives the topmost bar's edge a hairline of room; it never reaches
  the y-domain top anyway (the domain has 8% headroom).
- Clipping `pb-hits` is intended: a bar that has slid out of the plot should
  not be hoverable.

Order matters — insert `g.pb-clipped` in the same position the groups occupy
today, so the tracks still paint under votes, votes under gaps, and the line
over all three.

## 7. `AgeBeats.tsx`

### 7.1 Pairing and `activeRows`

Replace the index-pairing in `AgeBeats.tsx:94-109`. Build three memos:

```ts
/** 2024 -> 2022: the same cohort is two years younger. */
const SHIFT_YEARS = 2;

const rows2022ByAge = useMemo(
  () => new Map(rows2022.map((r) => [Number(r.x), r])),
  [rows2022]
);

// The t=1 resting state, memoized so the d3 effect doesn't re-run on every
// scroll quantum once the morph has settled - same reason `rows2024` is
// returned by identity at t=0.
const rowsSettled2022 = useMemo(
  () =>
    rows2024.map((r) => {
      const age = Number(r.x);
      const target = rows2022ByAge.get(age - SHIFT_YEARS);
      const xPos = age - SHIFT_YEARS;
      // Cohorts 18 and 19 were 16 and 17 in 2022 - below voting age, so
      // Census has no row for them. They slide off the left edge holding
      // their real 2024 heights rather than lerping toward a number that
      // doesn't exist. (The mirror of this: slots 99 and 100 end up empty,
      // because filling them would need 2024 ages 101-102. Those bars are
      // ~1px tall and worth 0.013M of the 36.1M gold total - the printed
      // figure is still the full-year one.)
      if (!target) return { ...r, xPos, opacity: 0 };
      return { ...target, key: r.key, xPos };
    }),
  [rows2024, rows2022ByAge]
);

const activeRows = useMemo(() => {
  if (t <= 0) return rows2024;
  if (t >= 1) return rowsSettled2022;
  return rows2024.map((r) => {
    const age = Number(r.x);
    const target = rows2022ByAge.get(age - SHIFT_YEARS);
    const xPos = age - SHIFT_YEARS * t;
    if (!target) return { ...r, xPos, opacity: clamp01(1 - t / 0.4) };
    return {
      ...r,
      xPos,
      cvap: lerp(r.cvap, target.cvap, t),
      votes: lerp(r.votes, target.votes, t),
      expected: lerp(r.expected, target.expected, t),
      missing: lerp(r.missing, target.missing, t),
      turnout: lerp(r.turnout, target.turnout, t),
    };
  });
}, [rows2024, rows2022ByAge, rowsSettled2022, t]);
```

Keep `label` from the **target** in the settled state (spread order above
already does this) — the bar in slot 38 must report itself as age 38, not 40,
the moment the labels snap.

`ratesPooled` likewise comes from the target, so the 80+ opacity treatment
follows the cohort to its new slot.

### 7.2 Tooltip

`shownRowsByKey` (`AgeBeats.tsx:116`) is keyed by bar key and currently
assumes key ≡ age. Once 2022 is the shown year, bar `age-a` displays 2022's
age `a-2`:

```ts
const shownRowsByKey = useMemo(() => {
  if (!shownYear2022) return new Map(rows2024.map((r) => [r.key, r]));
  // Cohort-aware: bar `age-a` is showing 2022's age a-2 by now.
  const m = new Map<string, PopulationBarRow>();
  for (const r of rows2024) {
    const target = rows2022ByAge.get(Number(r.x) - SHIFT_YEARS);
    if (target) m.set(r.key, target);
  }
  return m;
}, [shownYear2022, rows2024, rows2022ByAge]);
```

`tooltipFor` (`AgeBeats.tsx:150-166`) must now return `null` when the key is
missing (the two departed cohorts) rather than falling back to `row`, which
mid-morph is lerped geometry:

```ts
const real = shownRowsByKey.get(row.key);
if (!real) return null; // a cohort that has slid off the chart
```

Change the `?? row` fallback — it was load-bearing before and is now wrong.

### 7.3 Guard the Tooltip render

`PopulationBars.tsx:421` renders `<Tooltip>` whenever `hover && tooltipFor`,
which would now paint an empty box. Compute once and guard:

```tsx
{(() => {
  if (!hover || !tooltipFor) return null;
  const content = tooltipFor(hover.row);
  return content ? <Tooltip content={content} clientX={hover.clientX} clientY={hover.clientY} /> : null;
})()}
```

(Or hoist to a `const tooltipContent = hover && tooltipFor ? tooltipFor(hover.row) : null;`
above the return — either is fine, prefer whichever reads cleaner in context.)

Widen `tooltipFor`'s return type to `ReactNode` if TS complains; `ReactNode`
already includes `null`.

## 8. Copy

The motion now asserts a cohort claim, so the copy has to name it. Two edits
in `AgeBeats.tsx`, both **author-review items** — implement them as written,
but flag them in the summary so they can be reworded.

**Step 6** (`AgeBeats.tsx:~296`) — "change exactly one thing about it" is no
longer strictly true once the bars also move two years. Soften the last
sentence:

> Nothing has moved: same bars, same 2024 election, same line. Now rewind two
> years and take the president off the ballot. In a midterm, turnout drops for
> everyone. The question is whether it drops evenly.

**Step 7** — add one sentence at the top of the first paragraph naming what
the reader just watched:

> Every bar slid two years left as it fell — it's the same people, two years
> younger. The two youngest slid clean off the chart: 2024's 18- and
> 19-year-olds weren't old enough to vote in 2022 at all.

**Do not touch Beat 3's compare table.** It is an explicit same-age
comparison (18 vs 18, 22 vs 22) and remains correct and unchanged. If the
copy ever needs to reconcile the two, the honest line is that the table
compares ages while the animation follows people — but don't add that unless
the author asks.

## 9. Acceptance criteria

1. **t=0 is pixel-identical to today.** Diff `age-beats-step-0.png` …
   `step-5.png` against the committed baselines in `tests/screenshots/`.
   Any difference is a bug in the `xPos` default path.
2. **t=1 matches the real 2022 chart** for slots 18-98: for a sample of ages
   (18, 22, 30, 40, 65, 79, 90), the drawn bar heights equal
   `yScale(cycle2022.rows[age])`. Slots 99-100 are empty by design.
3. **Monotone slide.** Sampling the morph at 40 scroll positions, the
   `x` attribute of a tracked bar (`rect.pb-track` at a known index)
   decreases monotonically and totals exactly `2 * xScale.step()` of travel.
   Position and height must move together — sample both and confirm neither
   finishes before the other.
4. **No number ever interpolates.** `tests/beat2-morph.mjs` must still pass
   unchanged. If it doesn't, the labels are reading from `activeRows`
   somewhere.
5. **Nothing paints outside the plot.** At t=0.5, no `rect.pb-track` or
   `rect.pb-votes` is visible left of the y-axis; the departing bars are at
   opacity 0.
6. **Tooltip truth.** At t=1, hovering the bar in slot 38 reports "Age 38 ·
   2022" with 2022's age-38 numbers. Hovering where a departed cohort would
   be shows no tooltip.
7. **Beats 3 and 4 unchanged.** They never pass `xPos`; screenshot-diff them.
8. Mobile (390px) and dark mode both still render — `voter-age-dark.mjs`,
   and the mobile screenshots in `tests/screenshots/`.

## 10. Tests

Add `tests/cohort-slide.mjs`, modelled on `tests/beat2-morph.mjs` (reuse its
morph-window discovery — it reads `u` back off the year-stamp opacity rather
than assuming a scrollY formula; do the same, don't invent a new harness).
Cover criteria 3, 5, and 6. Write new screenshots to `tests/screenshots/` with
a `cohort-slide-*` prefix at u = 0, 0.25, 0.5, 0.75, 1.

Run against a dev server on **5174**:
`BASE_URL=http://localhost:5174 node tests/cohort-slide.mjs`

Also re-run, unchanged: `beat2-morph.mjs`, `age-beats-steps.mjs`,
`tooltip-check.mjs`, `voter-age-smoke.mjs`, `voter-age-dark.mjs`.

## 11. Order of work

1. `PopulationBars.tsx`: `xPos` + `opacity` + `xOf` + the contiguity assert.
   Verify beat 1 is unchanged before going further (criterion 1).
2. `PopulationBars.tsx`: clip path.
3. `AgeBeats.tsx`: pairing, `activeRows`, `rowsSettled2022`.
4. `AgeBeats.tsx` + `PopulationBars.tsx`: tooltip cohort mapping and null guard.
5. Copy.
6. Tests and screenshots.
7. Append a short addendum to `.claude/voter-age-morph-honesty-spec.md`
   pointing at this file and adding the position row to its §2 channel table,
   so the two specs don't drift.

## 12. Things to flag back, not decide alone

- The §8 copy wording.
- If the departing bars read as a glitch rather than a statement at real
  scroll speed, say so — the fallback is to slow their fade (`t / 0.7`) so
  they are legible for longer, not to delete them.
- If the empty slots 99-100 turn out to be visible at some viewport width,
  report the width rather than synthesising bars.
