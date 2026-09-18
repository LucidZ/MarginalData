# VoterAge Beat 2: scroll-driven morph instead of a step flip

Implementation brief. Everything below is scoped to
`src/2026/VoterAge/` in the `voter-age-participation` worktree
(`/Users/lucas/code/MarginalData-voter-age`, branch `voter-age-participation`).

## 1. The problem

Beat 2 swaps the 2024 dataset for the 2022 dataset at a step boundary:

```ts
// Beat2.tsx:37-39
const activeCycle = step === 0 ? cycle2024 : cycle2022;
const activeRows  = step === 0 ? rows2024 : rows2022;
const showHypothetical = step === 1;
```

`step` comes from `useActiveStep.ts` — an IntersectionObserver with
`rootMargin: "-50% 0px -50% 0px"`, i.e. a binary flip when a step element
crosses mid-viewport. The animation the reader sees is
`PopulationBars.tsx:135`:

```ts
const t = svg.transition().duration(700).ease(easeCubicOut);
```

That is a **time**-driven tween, not a **scroll**-driven one. Consequences:
you cannot stop halfway, and scrolling back across the line just fires the
same 700ms tween in reverse, interrupting whatever was in flight.

## 2. The goal

The chart becomes a pure function of a continuous scroll fraction, the way
`src/2026/MarginalTax/App.tsx:174-179` drives `income` from
`scrolled / totalScrollable`. Stopping mid-scroll leaves the chart frozen at
that intermediate state; reversing retraces it exactly; the same scroll
position always produces the same frame.

**Non-goals.** Do not change Beat 1, Beat 3, Beat 4, `ColoradoDots`, any
data, any copy, or the sticky-positioning logic in `StickyViz.tsx`. Do not
delete `useActiveStep.ts` — other beats still use it.

## 3. Why this is cheap here

Both cycles share row keys (`age-18` … `age-100`) and `ratesPooled` flags, so
the d3 join is pure *update* — no enter/exit churn. And `yDomain` is already
pinned across both cycles (`Beat2.tsx:41-45`), so nothing rescales. The morph
is a per-field lerp and nothing else.

## 4. Changes

### 4.1 New file: `src/2026/VoterAge/useStepProgress.ts`

A continuous sibling to `useActiveStep`. Returns a **fractional** step index
in `[0, count-1]`: `0` when step 0's center sits at viewport center, `1` when
step 1's does, and the interpolated value in between.

```ts
import { useEffect, useRef, useState } from "react";

/**
 * Continuous sibling to useActiveStep: instead of "which step is active",
 * returns a fractional step index - 0.0 when step 0 is centered, 1.0 when
 * step 1 is centered, 0.5 exactly between them. Lets a sticky viz be a pure
 * function of scroll position, so a reader can stop mid-transition and
 * reverse it, rather than watching a fixed-duration tween replay.
 *
 * Measured per frame rather than cached because step heights are viewport
 * relative (min-height: 70vh) and the sticky viz's own measured height
 * feeds back into layout - a cached center goes stale on resize and on
 * the ResizeObserver pass in StickyViz.
 */
export function useStepProgress(count: number): {
  progress: number;
  activeStep: number;
  setStepRef: (i: number) => (el: HTMLElement | null) => void;
} {
  const [progress, setProgress] = useState(0);
  const elsRef = useRef<(HTMLElement | null)[]>(new Array(count).fill(null));

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const els = elsRef.current;
      if (els.length < 2 || els.some((el) => !el)) return;
      const y = window.scrollY + window.innerHeight / 2;
      const centers = els.map((el) => {
        const r = el!.getBoundingClientRect();
        return r.top + window.scrollY + r.height / 2;
      });
      let p = 0;
      if (y <= centers[0]) p = 0;
      else if (y >= centers[centers.length - 1]) p = centers.length - 1;
      else {
        for (let i = 0; i < centers.length - 1; i++) {
          if (y >= centers[i] && y <= centers[i + 1]) {
            const span = centers[i + 1] - centers[i];
            p = i + (span > 0 ? (y - centers[i]) / span : 0);
            break;
          }
        }
      }
      // Quantize: a sub-pixel scroll shouldn't re-run the d3 join. 1/200
      // is finer than the eye can resolve across a ~700px morph.
      const q = Math.round(p * 200) / 200;
      setProgress((prev) => (prev === q ? prev : q));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    measure();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [count]);

  const setStepRef = (i: number) => (el: HTMLElement | null) => {
    elsRef.current[i] = el;
  };

  return { progress, activeStep: Math.round(progress), setStepRef };
}
```

Note the `activeStep` here flips at center-crossing, slightly later than
`useActiveStep`'s top-crossing. That is fine for Beat 2, where `activeStep`
drives nothing once the chart is continuous — but don't swap this hook into
another beat without checking what its `activeStep` controls.

### 4.2 `PopulationBars.tsx`: an optional no-transition path

Add two props (both defaulted so Beats 1/3/4 are byte-for-byte unaffected):

```ts
  /** 0 disables d3's time-driven tween entirely, for a chart whose values
   * are driven continuously by scroll position - a tween there fights the
   * scroll instead of following it, and can't be stopped or reversed
   * mid-flight. Default 700 keeps the step-to-step animation everywhere else. */
  transitionMs?: number;
  /** Continuous override for `showExpected2`'s 0/1 visibility, so the
   * second marker can fade in across a scroll span rather than popping
   * at a step boundary. Applies to the legend entry too. */
  expected2Opacity?: number;
```

Replace the single transition constant:

```ts
// was: const t = svg.transition().duration(700).ease(easeCubicOut);
const tr = transitionMs > 0 ? svg.transition().duration(transitionMs).ease(easeCubicOut) : null;
const anim = (sel: any) => (tr ? sel.transition(tr) : sel);
```

Then replace every `.transition(t as any)` in the effect with `anim(...)`.
Do **not** keep `svg.transition().duration(0)` — a zero-duration transition
still schedules a timer and still *interrupts* the previous one, which is
precisely the stutter being removed. The call sites are the tracks join, the
votes join, the gaps join, both axes, the expected line/ticks, the expected2
line, and the missing labels.

Two details that bite:

- **Gap-rect enter.** The gaps join enters at `height: 0` and tweens up. With
  no transition that becomes a pop as a bar crosses the benchmark. Give enter
  its final geometry when `tr` is null:
  ```ts
  .attr("y", (d) => (tr ? yScale(d.votes) : yScale(d.expected)))
  .attr("height", (d) => (tr ? 0 : yScale(d.votes) - yScale(d.expected)))
  ```
  The gap is ~0 at the moment of crossing anyway, so it emerges from nothing.
- **Category label rotation.** The `xKind === "category"` branch rotates tick
  text after `.call()`. With `anim()` that still runs correctly, but verify
  Beat 3's rotated labels visually — it is the one place the transition was
  load-bearing for ordering.

Wire the opacity: `const e2 = expected2Opacity ?? (showExpected2 ? 1 : 0);`
use it for the `pb-expected2-line` `style("opacity", …)`, and render the
legend entry when `e2 > 0.01` with `style={{ opacity: e2 }}` so the legend
fades with the line instead of snapping.

Add `transitionMs` and `expected2Opacity` to the effect's dependency array.

### 4.3 `Beat2.tsx`: lerp the rows

Swap `useActiveStep` for `useStepProgress`, and derive everything from `t`:

```ts
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const { progress, setStepRef } = useStepProgress(STEP_COUNT);

// progress 0 = step 0 centered, 1 = step 1 centered. Start the morph after
// the reader has left step 0's text and finish it before step 1's is
// centered, so the end state is on screen while its paragraph is being read.
const t = clamp01((progress - 0.15) / 0.7);
const e2 = clamp01((t - 0.6) / 0.4);
```

Interpolate rows and the legend scalars:

```ts
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

const activeRows = useMemo(
  () => rows2024.map((r, i) => {
    const b = rows2022[i];
    return {
      ...r,
      cvap: lerp(r.cvap, b.cvap, t),
      votes: lerp(r.votes, b.votes, t),
      expected: lerp(r.expected, b.expected, t),
      expected2: lerp(r.expected2!, b.expected2!, t),
      missing: lerp(r.missing, b.missing, t),
      turnout: lerp(r.turnout, b.turnout, t),
    };
  }),
  [rows2024, rows2022, t]
);

const over65 = lerp(cycle2024.over65Turnout, cycle2022.over65Turnout, t);
const avg = lerp(cycle2024.avgTurnout, cycle2022.avgTurnout, t);
```

`missing` is linear in `votes` and `expected`, so lerping it directly stays
consistent with the gold shading — no need to recompute. The rows arrays are
index-aligned (same ages, same order, both built from `cycle.rows`); if that
ever stops being true, key the lookup by age instead.

The legend percentages must use `over65`/`avg`, not the cycle constants —
otherwise the parenthesized numbers snap while the lines glide. The
`{fmtPct(cycle2022.over65Turnout)}` references inside the **step text** stay
as they are: that's prose about 2022, not a chart label.

Pass through:

```tsx
expectedLineLabel={`expected at the 65+ rate (${fmtPct(over65)})`}
expectedLine2Label={`expected at the national average (${fmtPct(avg)})`}
showExpected2={e2 > 0}
expected2Opacity={e2}
transitionMs={0}
```

The `pb-gap-summary` total recomputes from `rows` already, so the "36.1M
missing votes" figure counts up continuously with no extra work.

## 5. Verify

Dev server runs on **5183** in this worktree (`npm run dev`); the test scripts
default to 4321, so pass `BASE_URL=http://localhost:5183`.

Write `tests/beat2-morph.mjs`, modeled on the existing `tests/beat2-steps.mjs`
(same section-locating boilerplate). It must assert the three properties that
distinguish a scroll-driven morph from a tween:

1. **Intermediate states exist.** Sample `.pb-gap-summary strong` at ~8 scroll
   positions across the step0→step1 span, waiting only ~80ms (not 900ms) after
   each scroll. Values must move monotonically and land strictly between the
   2024 and 2022 endpoints. Under the old code the short wait would catch
   mid-tween garbage that does *not* reproduce.
2. **Reversibility.** Re-visit the same positions in descending order. Each
   reading must match its ascending counterpart exactly.
3. **Stability.** Scroll to a midpoint, wait 1.5s, re-read. The value must be
   unchanged — proof nothing is still easing toward an endpoint.

Also re-run `tests/beat2-steps.mjs` and `tests/voter-age-smoke.mjs` for
regressions, and confirm Beats 1/3/4 still animate on step change (that's the
`transitionMs` default doing its job).

Then: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## 6. Acceptance

- [ ] Stopping mid-scroll in Beat 2 leaves the chart visibly between 2024 and
      2022 — bars, both dotted lines, the gold wedge, and the missing-votes
      total all partway.
- [ ] Reversing retraces the same states; no tween replays, no stutter.
- [ ] Legend percentages count continuously; they never jump.
- [ ] The orange national-average line and its legend entry fade in; neither pops.
- [ ] Beats 1, 3, 4 unchanged in behavior and appearance.
- [ ] Scroll stays smooth on a mid-range laptop — if the join is too heavy per
      frame, coarsen the quantizer in `useStepProgress` before touching the
      render path.
- [ ] `tsc --noEmit`, `lint`, and `build` all clean.

## 7. If it's janky

The redraw is ~83 bars x 4 layers per quantized step. Before optimizing the
d3 code, try coarsening quantization from 1/200 to 1/100. If that isn't
enough, the next cheapest win is skipping the x-axis re-issue when the scale
is unchanged — the age axis is identical across both cycles and doesn't need
re-rendering per frame.
