# Scroll-Scrubbed Scatter Animation — Architecture

**Status:** Planned, not yet implemented.  
**Scope:** `src/financial-literacy/TheNet/App.tsx` + `src/financial-literacy/TheNet/FlowViz.tsx`  
**Goal:** Make the scatter appearance (steps 1–8) and categorize animation (step 9) scroll-driven — animation progress = scroll position, fully reversible.

---

## Core invariant

All animation state is a **pure function of `(currentStep, stepProgress)`**. No timers, no accumulated state. Scrolling back un-does everything.

---

## The two animations to scrub

### 1. Scatter appearance (steps 1–8, phase = 'scatter')

Each step introduces one new expense item. Currently: CSS transition fires once when `visibleItems` increments (snap, not scrubbed).

Target: `itemScale(i)` computed from `stepProgress`:
- `i < visibleItems - 1` → `scale = 1` (already appeared)
- `i === visibleItems - 1` → `scale = d3.easeCubicOut(stepProgress)` (growing now)
- `i > visibleItems - 1` → `scale = 0` (not yet)

`visibleItems` still comes from `VIZ_MAP[currentStep]` — discrete, unchanged. The seam between steps is clean: item N-1 reaches scale 1 at end of step N, item N starts from scale 0 at start of step N+1.

### 2. Categorize (step 9, phase = 'categorizing')

Currently: `FlowViz` owns local `categorizeProgress` state driven by a 3400ms RAF.

Target: `categorizeProgress` is removed from FlowViz. It becomes `stepProgress` passed as a prop. The `CAT_TIMING` windows already handle per-item staggering within the 0–1 range — no changes there.

```typescript
// This block in FlowViz already does the right thing,
// just swap categorizeProgress → stepProgress:
const rawCatT = timing ? (stepProgress - timing.start) / timing.window : 0;
const catProgress = d3.easeCubicInOut(Math.max(0, Math.min(1, rawCatT)));
```

---

## Three concrete changes

### ① Add scroll listener in TheNet/App.tsx

Keep `IntersectionObserver` → `currentStep` for narrative text (still snaps).  
Add a **separate passive scroll listener** → `stepProgress` for the viz:

```typescript
const [stepProgress, setStepProgress] = useState(0);

useEffect(() => {
  const onScroll = () => {
    const el = stepRefs.current[currentStep];
    if (!el) return;
    const { top, height } = el.getBoundingClientRect();
    // 0 = step top at viewport center, 1 = step bottom at viewport center
    const p = (window.innerHeight / 2 - top) / height;
    setStepProgress(Math.max(0, Math.min(1, p)));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // seed immediately on step change
  return () => window.removeEventListener('scroll', onScroll);
}, [currentStep]);
```

Pass `stepProgress` to `<FlowViz stepProgress={stepProgress} ... />`.

### ② FlowViz: remove internal RAF, add stepProgress prop

**Remove:**
- `categorizeProgress` local state
- The 3400ms RAF `useEffect` + `catRafRef`
- `prevVisibleRef` cascade delay logic (was used for stagger; replaced by pure stepProgress derivation)

**Add:**
- `stepProgress: number` to props interface

**Replace:** every `categorizeProgress` reference → `stepProgress`

### ③ Scatter item scale: SVG transform instead of CSS transition

Current uses CSS `transform: scale(...)` with `transition: 420ms cubic-bezier(0.34, 1.56, 0.64, 1)`.  
CSS transitions fight scrubbing — they chase values over time instead of snapping. Remove them.

The outer `<g>` already translates to each item's center point, so scaling from `(0,0)` = scaling from center:

```tsx
<g transform={`translate(${cx},${cy}) rotate(${s.rot})`}>
  <g transform={`scale(${itemScale(i)})`}>
    <rect x={-BAR_W / 2} y={-h / 2} width={BAR_W} height={Math.max(h, 8)} fill={SCATTER_GRAY} rx={2} />
  </g>
</g>
```

**Easing:** Use `d3.easeCubicOut(stepProgress)` for item scale. Drop the overshoot bezier — overshoot (scale briefly > 1) looks broken when scrolling slowly or backward.

---

## What stays the same

- `CAT_TIMING` stagger windows
- `d3.interpolateRgb` color interpolation per item during categorize
- `cycleProgress` RAF for month2/month3 (intentionally time-based, not scroll-scrubbed)
- All chunk geometry, net annotation, category bracket labels
- `IntersectionObserver` → `currentStep` for step text

## What gets removed

- `catRafRef`, the 3400ms `useEffect`, `setCategorizeProgress`
- CSS `transition` on scatter items' inner `<g>`
- `prevVisibleRef` and its cascade delay (`(i - prevVisible) * 110ms`)

---

## Scope estimate

~35–40 lines changed across two files. No new files, no new dependencies.
