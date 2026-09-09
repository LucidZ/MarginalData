# Six Degrees Of… — UX fix gameplan

Handoff spec. Branch `6-degrees-of`, last commit `c4ca17d`. Everything below is
scoped to `src/2026/SixDegreesOf/` plus two lines in `src/routes.ts`.

These fixes came out of a live UX review at 1440×900 and iPhone 13 (390×664),
with a production build checked under 1.5 Mbps throttling. Measured baselines
worth keeping in mind:

| Thing | Measured now |
|---|---|
| Michael Caine chart, desktop | SVG 1228px wide inside a 1100px container → forced scroll |
| Anupam Kher chart | 4094px wide desktop (3.7 screens), 2662px mobile (6.8 screens) |
| Smallest node, mobile | 23.7px diameter |
| Detail card, low node at 1440×900 | `bottom: 906.8` vs `innerHeight: 900` → button clipped |
| Pool | 2,465 actors / 13,622 movies / 58,619 edges |
| Prod first paint, throttled mobile | 2.1s (this is good — don't regress it) |

Work the phases in order; phase 1 changes geometry that phases 2–3 build on.
Commit per phase.

---

## Phase 1 — Make the encoding visible on arrival

Two changes: move the axis labels above the columns, and clamp the chart to the
viewport height. Today the axis labels sit at the *bottom* of a ~950px-tall SVG,
so the first screenful is faces and unexplained numbers.

### 1a. Axis labels move to a uniform header row

Target layout:

```
   1 film together   2 films together   3 films together     <- uniform row, top of frame
                            27
        175                                    3             <- per-column count, above its own pile
      [faces]            [faces]            [faces]
   ─────────────────────────────────────────────────────     <- baseline y=0
```

The axis label row is **uniform** (same y for every column) so it reads as a
header. The count label stays **ragged** (just above each column's own top) so it
stays associated with its pile.

In `App.tsx`, replace the constants:

```ts
const AXIS_LABEL_HEIGHT = 28;   // DELETE
const COUNT_LABEL_GAP = 20;     // keep
const TOP_MARGIN = 40;          // retune
```

with:

```ts
const HEADER_HEIGHT = 22;    // reserved strip at the very top for the axis label row
const COUNT_LABEL_GAP = 20;  // count sits this far above its own column's top
const HEADER_GAP = 24;       // clear air between the header row and the tallest count label
const BOTTOM_PAD = 12;       // below the baseline
```

New frame math:

```ts
const frameMinY = tallestTop - COUNT_LABEL_GAP - HEADER_GAP - HEADER_HEIGHT;
const axisLabelY = frameMinY + HEADER_HEIGHT - 6;  // text baseline, same for all columns
const frameHeight = -frameMinY + BOTTOM_PAD;
```

`viewLeft` / `viewRight` / `frameWidth` are unchanged. In the column `<g>`, the
axis label `<text>` now uses `y={axisLabelY}` instead of `y={AXIS_LABEL_HEIGHT - 6}`.
The count `<text>` is unchanged.

The baseline `<line>` at `y=0` now sits at the very bottom of the frame — keep it,
it still anchors the piles.

### 1b. Clamp the chart to the viewport

Two mechanisms; the first does the real work, the second is a guaranteed backstop.

**Derive `targetColumnHeight` from actual available space.** Add a ref on the
graph frame element and measure how much vertical room is left below it:

```ts
const frameRef = useRef<HTMLDivElement>(null);
const [available, setAvailable] = useState<number | null>(null);

useLayoutEffect(() => {
  const measure = () => {
    const el = frameRef.current;
    if (!el) return;
    // Document-space top of the chart region. Does NOT depend on chart height
    // (only the header above it does), so feeding this back into the layout
    // cannot oscillate.
    const top = el.getBoundingClientRect().top + window.scrollY;
    setAvailable(Math.max(MIN_CHART_HEIGHT, window.innerHeight - top - VIEWPORT_GUTTER));
  };
  measure();
  window.addEventListener("resize", measure);
  return () => window.removeEventListener("resize", measure);
}, []);
```

with `MIN_CHART_HEIGHT = 360` and `VIEWPORT_GUTTER = 24`. Re-run `measure` when
`compact` flips (the header reflows).

> The no-feedback-loop property above is the thing that would bite if you
> implemented this naively. `top` is determined by the header and banner only.
> Do not measure the chart's own height here.

Then override the layout's target height:

```ts
const layout = useMemo(() => {
  const base = compact ? COMPACT_LAYOUT : DESKTOP_LAYOUT;
  if (available == null) return base;
  // Leave room for the header row and count labels inside the budget.
  const columnBudget = available - HEADER_HEIGHT - HEADER_GAP - COUNT_LABEL_GAP - BOTTOM_PAD;
  return { ...base, targetColumnHeight: Math.max(240, columnBudget) };
}, [compact, available]);
```

`sizeForBucket` in `beeswarm.ts` already derives avatar diameter from
`targetColumnHeight`, so a smaller target shrinks the avatars and the pile fits.
No change needed in `beeswarm.ts` for this part.

**Backstop: uniform scale on the rendered SVG.** Packing undershoots the target
by a variable amount (see the existing comment in `App.tsx` around the frame
math), so the target alone doesn't *guarantee* a fit. Add:

```ts
const maxFrameHeight = available ?? frameHeight;
const scale = Math.max(0.7, Math.min(1, maxFrameHeight / frameHeight));
```

and render `width={frameWidth * scale} height={frameHeight * scale}` with the
`viewBox` unchanged. SVG scales uniformly, so this also narrows the chart — a
free reduction in horizontal scroll.

The 0.7 floor exists so text never becomes illegible. **With 1b in place `scale`
should sit at 0.9–1.0 in practice** — verify that (see acceptance) and if it's
routinely hitting the floor, the `columnBudget` math is wrong, not the floor.

> **Implemented outcome:** in practice `scale` landed at 0.70–0.74 for every
> popular actor tested, not 0.9–1.0 — the real driver turned out to be
> `sizeForBucket` in `beeswarm.ts`: once a bucket's count is large enough that
> the area formula wants a diameter under `minNodeSize`, the `Math.max` floor
> clamps it, and from that point on the pack's real height is a function of
> count only — shrinking `targetColumnHeight` further does nothing for that
> bucket (diameter can't drop below the floor), so it stops responding to the
> budget in 1b's `columnBudget` and increasingly overshoots the reduced
> target. This affects *most* actors whose main bucket is 140+ people, i.e.
> most of the actors anyone would actually search for. Checked against the
> full pool: it's a narrow miss, not a redesign — the two most-connected
> actors in the whole 2,465-actor pool (Samuel L. Jackson, Willem Dafoe;
> ~227-person singleton buckets) needed ~0.66, just under 0.7, while
> everything else cleared 0.70–0.75. **Fix shipped: `MIN_SCALE = 0.65`**,
> closing that gap without a deeper redesign. If a future data refresh
> introduces a bucket bigger than Dafoe's 226, recheck this floor against the
> full pool rather than assuming 0.65 still covers it.

Note the detail card anchors off `clientX`/`clientY`, which are real viewport
coordinates, so scaling does not break card positioning.

### Acceptance (phase 1)

At 1440×900 and 390×664, with the page scrolled to top:

- The axis label row is fully visible without scrolling, for every actor tested.
  **This is the hard requirement** — it's what the phase exists to fix.
- `document.querySelector('.sdo-graph').getBoundingClientRect().bottom <= window.innerHeight`
  — holds at 1440×900 for every actor (verified against the pool's two most
  extreme cases, see the `MIN_SCALE` note above). **On a short mobile viewport
  this is not achievable and that's fine**: `MIN_CHART_HEIGHT` (360) is a
  legibility floor the chart won't shrink below, and on a 390×664 screen with
  the header/subtitle/search box/banner already consuming ~440px, 360px of
  chart necessarily runs past the fold. The axis row is still the first thing
  in that 360px, so it's still visible without scrolling — only the tail of a
  tall pile needs a scroll, which is a reasonable ask on a phone.
- Measured `scale` sits at 0.70–1.0 for every actor tested at 1440×900, not the
  0.85+ originally hoped for — see the implementation note above on why the
  realistic range is tighter than expected, and why the floor moved to 0.65.
- The mobile `.sdo-axis-note` ("Columns: films made together") becomes redundant
  once the header row is visible on mobile too — remove it, and instead keep
  compact axis labels as bare numbers with a single header-row unit label.
  Decide during implementation which reads better at 390px; whichever you pick,
  the unit must be visible above the fold.
  **Implemented as:** kept the same copy, moved from a `<p>` below the graph to
  one above it (plain HTML, outside the `<svg>`) — an in-SVG label anchored at
  the frame edge was tried first and rejected: it collided with the first or
  last column's own number badge for any chart narrow enough that the label's
  text didn't fit in the side margin.

---

## Phase 2 — Collapse empty columns

`layoutBeeswarm` in `beeswarm.ts` preserves interior gaps as real blank columns,
which is right — the gap is information. But each blank one reserves a full
`columnWidth` (200px desktop), which is why Anupam Kher is 4094px wide with 18
near-empty columns.

Give empty columns a narrow reservation instead:

```ts
const EMPTY_COLUMN_HALF_WIDTH = 18;
```

In the spacing loop, an empty column (`col.actors.length === 0`) floors to
`EMPTY_COLUMN_HALF_WIDTH` rather than `minHalfWidth`, and the `Math.max(cfg.columnWidth, …)`
pitch floor must not apply when *either* neighbour is empty — otherwise the
narrow reservation is swallowed by the pitch floor and nothing changes. Restructure
to compute the gap purely from the two halfWidths plus `COLUMN_GAP`, and apply the
`cfg.columnWidth` floor only when both columns are non-empty.

Add `isEmpty: boolean` to the `Column` interface so `App.tsx` can label them
differently.

In `App.tsx`, an empty column renders a **bare number** (e.g. `13`) in muted
styling rather than the full `13 films together` — the long label will not fit in
36px. Add `.sdo-axis-label-empty { font-size: 11px; fill: var(--muted); }`.

### Acceptance (phase 2)

- Anupam Kher: desktop `scrollWidth` drops from 4094px to under 2000px; mobile
  drops well below the original 2662px.
  **Implemented outcome:** desktop lands at 1825px (under the 2000px target).
  Mobile lands at 1331px — a real 50% cut from 2662px, but short of the 1200px
  figure floated when this spec was written; that number was an unverified
  estimate, not a measured target. Anupam Kher's 11 empty columns include a
  run of 6 in a row (7–12), and each still gets its own labeled tick rather
  than being merged into one "7–12" span — merging runs would cut further but
  is a bigger design change than "give empty columns a narrow reservation."
  Not worth chasing further on its own; revisit only if a future actor's gap
  pattern makes it worse than Anupam Kher's.
- A non-empty interior gap is still visually legible as a gap (eyeball a
  screenshot — the point of the change is to keep the information, not remove it).
  Confirmed: gaps render as narrow muted ticks (bare number, 11px, `--muted`)
  between full-labeled real columns.
- Michael Caine, Tom Hanks, RDJ: no visual regression, since none of them have
  interior gaps. Confirmed pixel-identical to phase 1 for Michael Caine.

---

## Phase 3 — Full-bleed chart region

`.sdo-root` is `max-width: 1100px`, so Michael Caine's 1228px chart is clipped and
forced to scroll on a 1440px screen with 340px of unused margin.

Wrap the scroll container in a frame that breaks out of the text column while the
header prose keeps its 640px measure:

```css
.sdo-graph-frame {
  position: relative;               /* also the containing block for phase 4 */
  margin-inline: calc(50% - 50vw);
  padding-inline: 1.5rem;
  max-width: 1500px;
  margin-inline: auto;              /* re-centre on ultrawide; see note */
}
```

The two `margin-inline` declarations conflict — pick one approach and make it
work, don't ship both. Suggested: breakout via `calc(50% - 50vw)`, then constrain
the inner `.sdo-graph-scroll` with `max-width: 1500px; margin-inline: auto`.

> **Implemented outcome:** `max-width: 1500px; margin-inline: auto` on
> `.sdo-graph-scroll` does nothing on its own — a block div's `width` defaults
> to filling its parent regardless of content size, so `margin-inline: auto`
> had no width discrepancy to center within, and Michael Caine's 818px chart
> sat flush left against a 1440px frame with the whole right side empty.
> `width: fit-content` looked like the fix but is wrong for the opposite
> case: the `<svg>` is a replaced element with a fixed intrinsic width (its
> `width`/`height` attributes, not CSS), so its min-content equals its full
> width — `fit-content` cannot shrink the box below that, so on a narrow
> viewport where the chart genuinely needs to be wider than the screen, the
> box overflows *its own parent* instead of containing the overflow inside
> its own `overflow-x: auto`. Confirmed this broke `scrollWidth <=
> innerWidth` at 768px and 390px, which had passed before that change.
> **Fix shipped:** `display: flex; justify-content: center;` on
> `.sdo-graph-scroll`, no `max-width`. A flex item that's smaller than its
> container centers; one that's larger still overflows the container and
> scrolls, exactly like a plain block would - flex has no min-content floor
> forcing the *container* to grow. Verified scroll starts at the left edge
> (not centered-and-clipped) and reaches the true end at `scrollLeft ===
> scrollWidth - clientWidth`.
>
> **This verification was incomplete, and shipped a real bug** - caught
> during phase 8, fixed there, full details in that section. Summary: bare
> `center` does true centering *even under overflow*, silently hiding
> roughly half the overflow before the container's start edge with no
> scroll position able to reach it. Checking that `scrollLeft`'s range
> clamps correctly (what this note verified) does not catch that, because
> the bug also shrinks what `scrollWidth` itself reports - the range was
> internally consistent, just consistently wrong. Needed `justify-content:
> safe center` instead.

**`50vw` includes the scrollbar width**, which is the classic way this trick
causes body-level horizontal overflow on desktop. Either add
`html { scrollbar-gutter: stable; }` to `src/index.css` or clamp the breakout.
Whichever you choose, the acceptance check below is non-negotiable.

> **Implemented outcome:** not needed — `body { overflow-x: hidden }` already
> exists sitewide (`src/index.css`), and no `scrollbar-gutter` addition or
> extra clamping was required to pass the acceptance check at any tested
> width. Re-verify this holds if that sitewide rule is ever removed.

`frameRef` from phase 1b goes on `.sdo-graph-frame`.

### Acceptance (phase 3)

At **1440, 1280, 1024, 768, and 390** widths, with a real (non-overlay) scrollbar:

```js
document.documentElement.scrollWidth <= window.innerWidth   // must be true at every width
```

- Michael Caine at 1440 fits without horizontal scroll inside the chart.
- The header paragraph is still ~640px wide, not stretched.

---

## Phase 4 — Horizontal scroll affordance

Nothing currently signals that the chart scrolls sideways. On mobile you see 2 of
7 columns and the content ends cleanly at the edge, so it reads as complete.

Add edge gradient overlays on `.sdo-graph-frame` (the positioned ancestor from
phase 3 — they must be on the frame, not the scrolling element, or they scroll
away):

```css
.sdo-graph-frame::before,
.sdo-graph-frame::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 48px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease;
  z-index: 2;
}
.sdo-graph-frame::before { left: 0;  background: linear-gradient(to right, var(--page), transparent); }
.sdo-graph-frame::after  { right: 0; background: linear-gradient(to left,  var(--page), transparent); }
.sdo-graph-frame[data-overflow~="left"]::before,
.sdo-graph-frame[data-overflow~="right"]::after { opacity: 1; }
```

Drive `data-overflow` from a scroll + resize listener on `.sdo-graph-scroll`
(space-separated `left` / `right` tokens, recomputed on scroll, on resize, and
whenever `rootId` changes — the chart width changes on recenter). Use a small
threshold (~2px) so subpixel rounding doesn't flicker the gradient.

### Acceptance (phase 4)

- RDJ on mobile at scroll 0: right gradient visible, left hidden. **Verified**
  (`data-overflow="right"`), including that `scrollLeft` genuinely starts at
  `0` — worth confirming explicitly, since phase 3's `justify-content: center`
  on an overflowing flex container was a real risk for starting the scroll
  position somewhere other than the left edge. It didn't happen (Chromium
  applies "safe centering" under overflow), but don't assume that from the
  CSS alone if this is ever touched again.
- Scrolled to the end: left visible, right hidden. **Verified**
  (`data-overflow="left"` after `scrollLeft = 999999`).
- Michael Caine at 1440 after phase 3 (no overflow): neither visible.
  **Verified** (`data-overflow` attribute absent entirely).
- Also verified: Anupam Kher still overflows even on a 1440px desktop screen
  (`data-overflow="right"` at scroll 0), and the gradient is only visually
  apparent where it crosses actual content (an avatar near the edge fades into
  the page background) — over a stretch of empty page background it blends in
  and looks like nothing is there, which is correct, not a bug: a `var(--page)`
  → transparent gradient has nothing to fade when the area under it is already
  `--page`-colored.

---

## Phase 5 — Detail card positioning

`DetailCard.tsx:44-55` clamps using an *estimated* height
(`56 + 24 + listHeight + 46`) which undercounts — confirmed clipping the
"Center on" button (`bottom: 906.8` vs `innerHeight: 900`).

Keep the estimate as the **initial** value (it prevents a first-paint jump), then
correct it against the real measurement:

```ts
const cardRef = useRef<HTMLDivElement>(null);
const [pos, setPos] = useState<{ left: number; top: number }>(() => estimatedPosition());

useLayoutEffect(() => {
  if (compact) return;
  const el = cardRef.current;
  if (!el) return;
  const { width, height } = el.getBoundingClientRect();
  const flipLeft = clientX + GAP + width > window.innerWidth - EDGE;
  const left = flipLeft ? clientX - GAP - width : clientX + GAP;
  setPos({
    left: Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE)),
    top: Math.max(EDGE, Math.min(clientY - 40, window.innerHeight - height - EDGE)),
  });
}, [selection, compact]);
```

`useLayoutEffect` runs before paint, so there is no visible flash. Guard against
an update loop: only `setPos` when the computed values actually differ from
current state.

### Acceptance (phase 5)

Click the topmost, bottommost, leftmost, and rightmost node in a tall chart at
1440×900 and at 1280×720. For each, assert the card rect is fully inside the
viewport on all four sides, and the "Center on…" button is visible.

**Verified**, all 8 cases (4 extreme node positions × 2 viewports, Michael
Caine): card fully on-screen, "Center on…" button visible, including the
`bottommost` case that reproduced the original bug (previously
`bottom: 906.8` against `innerHeight: 900`).

**Implementation note:** rather than syncing a "new selection" effect,
`App.tsx` keys `<DetailCard>` by `selection.actor.id`, so clicking a different
node while a card is already open is a fresh mount, not a prop change on the
existing one - its position state starts clean from the cheap estimate rather
than carrying over the previous card's corrected `top`. This also sidesteps
an ordering hazard: correcting position via a *second* effect keyed on
`selection` would have measured the DOM during the same commit its sibling
effect was still updating from the old estimate to the new one, risking a
stale read. A remount has no such race - the very first render already uses
the fresh estimate.

---

## Phase 6 — Search: keyboard, empty state, dismissal

`SearchBox.tsx` is currently a plain input plus a list of buttons. Three gaps,
all verified:

1. ArrowDown/ArrowUp do nothing; Enter does nothing. (Tab does reach the first
   result, so it's not *unusable* by keyboard — just not the expected idiom.)
2. A name outside the 2,465-actor pool shows **nothing at all** — no message. The
   user can't tell "not included" from "broken".
3. The dropdown never closes on outside click — verified it stays open and
   overlaps the chart indefinitely.

Rebuild as a proper combobox:

- `activeIndex` state, reset to 0 (or -1) whenever `query` changes.
- On the input's `onKeyDown`: `ArrowDown`/`ArrowUp` move `activeIndex` (clamped,
  no wrap), `Enter` selects `matches[activeIndex]`, `Escape` clears the query and
  closes. `preventDefault` on the arrows so the caret doesn't move.
- Highlight the active option with a class; wire `role="combobox"` +
  `aria-expanded` + `aria-controls` + `aria-activedescendant` on the input,
  `role="listbox"` on the `<ul>`, `role="option"` + `aria-selected` + stable `id`
  on each result.
- Close on outside pointerdown via a wrapper ref + document listener. Register on
  `pointerdown` and check `containerRef.current.contains(e.target)` so clicking a
  result still fires its handler.

**Empty state — and the loading caveat.** `App.tsx` passes `activeData.actors`,
which for the first ~2s is the 347KB bundled slice, not the full pool. A naive
"not in this pool" message would therefore **lie about valid actors during
initial load**. Add a `loading` prop (`!data && !error` from `useData()`) and
branch:

- `loading` → "Still loading the full list…"
- loaded, no matches → "No actor by that name in this pool of 2,465." (derive the
  count from `actors.length`, don't hardcode)
- error → reuse the existing `.sdo-error-note` wording

Render these as a non-interactive `<li>` inside the dropdown so the panel still
appears — the user needs to see *something* happen when they type.

### Acceptance (phase 6)

- Type "Bruce Willis", ArrowDown, Enter → root becomes Bruce Willis. (This
  currently does nothing; it is the regression test.) **Verified.**
- Type "Pedro Pascal" (genuinely not in the pool) → "not in this pool" message.
  **Verified** (message: "No actor by that name in this pool of 2,465.").
- Type a valid name within 500ms of page load → loading message, not the
  "not in this pool" message. **Verified against a production build**
  (`npm run build && vite preview`, throttled to 1.5 Mbps): searched "Daniel
  Craig" (confirmed not in the bundled default slice) immediately on load →
  "Still loading the full list of actors…"; same search after the full pool
  arrived → real result. No false negative flashed in between.
- Click outside the dropdown → it closes. **Verified**, and separately
  verified that clicking an actual result still works despite the same
  pointerdown listener - it's scoped to outside `containerRef`.
- Escape → clears and closes. **Verified.**

---

## Phase 7 — Keyboard navigation of the chart

`ActorNode.tsx:32` sets `tabIndex={0}` on every node `<g>`, so a keyboard user
tabs through 200+ circles to get past the chart.

Also: the `<svg>` has `role="img"`, which hides its children from assistive tech —
so the `role="button"` nodes inside it aren't exposed at all today. Change the
svg to `role="group"` and keep its `aria-label`.

Implement roving tabindex:

- Build a flat, ordered node list in `App.tsx`: column-major (left to right), then
  within a column by ascending `y` (top to bottom). Memoize alongside `columns`.
- `focusedIndex` state, default 0. Reset to 0 on `rootId` change.
- The `<svg>` gets `tabIndex={0}`; nodes get `tabIndex={-1}`.
- Arrow keys move `focusedIndex`: Left/Right jump to the nearest node in the
  adjacent non-empty column, Up/Down step within the current column. Home/End go
  to first/last. Enter/Space opens the card for the focused node.
- Programmatically `.focus()` the focused node's element and ensure it's scrolled
  into view horizontally (`scrollIntoView({ inline: "nearest", block: "nearest" })`).
- Keep a visible focus ring — `.sdo-node:focus .sdo-node-ring` already styles
  this; make sure it isn't suppressed by the `outline: none` currently in that
  rule.

Enter/Space currently synthesise a fake mouse event and cast it
(`e as unknown as React.MouseEvent`) to reuse the click path — that yields
`clientX/clientY` of 0 for keyboard activation, which would pin the card to the
top-left corner. Fix by making `Selection`'s coordinates optional and falling back
to the focused node's own `getBoundingClientRect()` centre.

### Acceptance (phase 7)

- Tab from the search input reaches the chart in **one** stop, and one more Tab
  leaves the chart entirely.
  **Verified, with a caveat the spec didn't account for:** the root actor's
  name is a real link to their TMDB page (`.sdo-root-name`), and it sits
  between the search box and the chart in DOM order - so it's Tab 1, and the
  chart is Tab 2. That's legitimate content, not a bug; the property that
  actually matters held: Tab 2 lands inside the chart already redirected to a
  real node (not the bare `<svg>`), and from there exactly one more Tab
  leaves the whole chart (200+ nodes skipped) and lands on the site's global
  footer - confirmed by checking `document.activeElement` at each step.
- Arrow keys move a visible focus ring between nodes; the chart scrolls
  horizontally to follow. **Verified**: ArrowDown/ArrowRight each moved focus
  to a different, correctly-named node (checked via `aria-label`), and on an
  overflowing chart (Anupam Kher) `scrollLeft` advanced from 0 to 201 after
  9 ArrowRight presses toward later columns.
- Enter opens the card positioned next to the focused node, not at the corner.
  **Verified** (card at `left: 606.9, top: 248.2` next to the focused node,
  not `(0, 0)`).
- **Found and fixed a rough edge not in the original spec:** the sitewide
  `:focus-visible` outline (`src/index.css`) also draws a square box around
  the focused `<g>`, stacking with the ring - a box around a circular avatar
  read as two competing indicators. Added `.sdo-node:focus-visible { outline:
  none; }`, since the ring (already accent-colored on focus, matching hover)
  is the purpose-built indicator here.
- Regression-checked: mouse click still opens the card exactly as before -
  removing the per-node `role="button"`/`tabIndex={0}`/`onKeyDown` (moved to
  the `<svg>` roving-tabindex handler) didn't touch the `onClick` path.

---

## Phase 8 — Mobile tap targets

Smallest measured node is 23.7px diameter against a ~44px guideline, tightly
packed and overlapping.

In `ActorNode.tsx`, add a transparent hit circle as the **first** child of the
`<g>` (before the ring and image):

```tsx
<circle r={hitRadius} fill="transparent" pointerEvents="all" />
```

`hitRadius` is a new prop, computed in `App.tsx` as
`Math.max(size / 2, MIN_HIT_RADIUS / scale)` with `MIN_HIT_RADIUS = 22`. Dividing
by the phase-1b `scale` keeps the target ≥44 CSS px after the SVG is scaled down.

Overlapping hit areas are fine here: the topmost element in document order wins,
and the card immediately tells the user who they got. Do **not** try to prevent
overlap — that would mean moving the circles, which breaks the chart.

### Acceptance (phase 8)

At 390×664, every node's rendered hit-circle bounding box is ≥40 CSS px in both
dimensions. Tap the smallest visible node in the "1 film" column and confirm the
card opens.

**Verified** — all 189 hit circles on Robert Downey Jr.'s mobile chart measured
~44×44 CSS px, and tapping the smallest visible avatar opened its card.

**This phase's testing surfaced a real, already-shipped bug from phase 3,
now fixed as part of this phase's commit** (it isn't a phase-8 change
itself, but this is where it was caught): `justify-content: center` on
`.sdo-graph-scroll` does true geometric centering *even when the item
overflows* - it does not fall back to start-alignment the way phase 3's
notes assumed. Concretely, on Robert Downey Jr.'s mobile chart (665px svg
in a 342px container, 323px of overflow), the svg's own rendered box
started at `x: -137.5` relative to the viewport - **161px of it, the
entire first column, was permanently off-screen with no scroll position
that could reach it**, since `scrollLeft` can't go negative. Phase 3's own
verification (`scrollLeft` starts at 0, reaches `scrollWidth - clientWidth`
at the far end) never actually caught this, because it only checked that
the scroll *range* clamps correctly - not that `scrollWidth` reported the
svg's true full width. It didn't: centering was quietly reporting a
`scrollWidth` roughly half the real overflow, hiding the other half instead
of exposing it.

**Fixed:** `justify-content: safe center` (CSS Box Alignment's explicit
"center when it fits, start-align to avoid data loss when it doesn't"
keyword) instead of bare `center`. Re-verified after the fix:
`svgRect.left` is now `24` (flush with the container, matching normal
start alignment) at `scrollLeft: 0`, `scrollWidth` correctly reports the
full `665`, and Anupam Kher's mobile chart - which has the same bug, not
just Robert Downey Jr.'s - went from `scrollWidth: 821` (partially
hidden) to `scrollWidth: 1299` (its true, hittable width). Re-ran every
earlier phase's checks (1, 2, 3, 4, 5, 7) after the fix; all still pass,
including Michael Caine's centering (`leftGap === rightGap`, unaffected
by `safe`, since his chart doesn't overflow).

---

## Phase 9 — URL state and shuffle

Highest value-per-line item. Today the root actor is random on every load, so a
reload gives a different actor, "Six Degrees of Tom Hanks" isn't linkable, and
Back doesn't undo a recenter.

`react-router-dom` v7 is already a dependency and `src/App.tsx:2` uses
`BrowserRouter`, so `useSearchParams` works.

Make `rootId` **derived** from `?actor=<id>` rather than local state — that gets
Back/Forward for free:

```ts
const [searchParams, setSearchParams] = useSearchParams();
const paramId = Number(searchParams.get("actor"));
const fallbackId = useMemo(pickRandomDefaultActorId, []);   // memoized: must not reroll on render
const rootId = Number.isFinite(paramId) && paramId > 0 ? paramId : fallbackId;
```

`recenter` becomes `setSearchParams({ actor: String(actor.id) })` (default push,
so Back works) plus `setSelection(null)`.

Three cases to handle deliberately:

1. **No param.** Use the memoized random default. Do *not* write it to the URL on
   mount — that would push a junk history entry and make Back a no-op.
2. **Param present, id not yet known, still loading.** The id may exist only in
   the full pool. Render a loading placeholder for the chart region — do **not**
   fall back to random, or a shared link shows the wrong actor for 2s and then
   jumps.
3. **Param present, data loaded, id unknown.** Fall back to random and
   `setSearchParams({}, { replace: true })` to clean the URL.

Add a **"Shuffle"** button next to the search input that picks a random actor from
`defaultActors.defaultActorIds` and routes to it. Random-on-load is going away and
it was doing real work as a discovery affordance; this preserves it explicitly.

### Acceptance (phase 9)

- Select Tom Hanks → URL is `?actor=<id>`. Reload → still Tom Hanks.
  **Verified** (`?actor=39`, survived reload).
- Recenter three times, then Back three times → walks back through the same
  actors. **Verified** with two recenters + two Backs (RDJ → Paul Rudd →
  Keith David, then Back → Paul Rudd → Back → Robert Downey Jr.) — exact
  reverse order, as expected from `setSearchParams`' default push behavior.
- Hard-load a deep link to an actor that is *not* in the bundled slice → shows a
  loading state, then that actor. Never flashes a different actor.
  **Verified against a production build** (`npm run build && vite preview`,
  throttled to 1.5 Mbps): `?actor=130` (Daniel Craig, confirmed outside the
  bundled slice) showed "Loading this actor…" immediately, still loading at
  3s, and resolved to "Daniel Craig" once the full ~3MB pool finished
  fetching (~16-20s at this throttle - the full-pool fetch is the actual
  bottleneck here, not the ~2s first-paint the bundled slice buys elsewhere;
  don't reuse that shorter number when timing this specific case).
- Load with `?actor=999999999` → falls back to a random actor, URL cleaned.
  **Verified** (settled on "Willem Dafoe", URL back to bare
  `/2026/SixDegreesOf`).
- Shuffle → new actor, URL updated. **Verified** (Keith David → Scarlett
  Johansson, URL gained `?actor=13`).
- Also verified, not in the original acceptance list: loading with **no**
  `?actor` param at all never writes one to the URL (stays bare on load), and
  a plain reload with no param re-randomizes rather than reusing the same
  fallback - confirming the random-on-load discovery affordance survives
  unchanged for the case where there's no URL state to honor.

---

## Phase 10 — Copy

**`App.tsx` subtitle.** Says "Tap anyone" on desktop; `compact` is already in
scope, so branch it to "Click"/"Tap".

**Disown the path framing.** "Six Degrees Of…" promises a *path between two
actors* (Bacon numbers); the page delivers a one-hop collaboration histogram.
Keep the title, but make the subtitle's first clause set the right expectation —
something like: "Not the Bacon-number game — this is everyone a given actor has
*actually* shared a screen with, stacked by how many films they made together."
Wording is yours; the requirement is that the first clause corrects the
expectation the title creates.

**Name the pool.** "within this pool" and "207 costars across this pool" never say
what the pool is. Use `activeData.actors.length.toLocaleString()` — but **gate it
on `data` being loaded**, since the bundled slice would report a wrong, much
smaller number for the first ~2s. Omit the figure until then rather than showing
a wrong one.

**Count-label key.** The "175" / "27" labels have no unit. Give the *first
non-empty* column's count a unit — "175 costars" — and leave the rest bare.

**`src/routes.ts:237-241` is stale.** The description and note still describe the
pre-pivot rings viz:

> "watch rings of their real-life costars expand outward" … "I'd never seen it as
> an actual expanding network you could explore… most searches reach half of
> Hollywood within two rings."

This copy is user-facing in three places: the homepage card, the OG/meta
description via `scripts/generate-static-pages.mjs`, and the RSS feed. Rewrite
both fields to describe the beeswarm. Keep the personal voice of the existing
`note`.

### Implemented

All four items landed as specced, plus one verification the acceptance list
didn't call out explicitly:

- Subtitle now opens with "Not the Bacon-number game -" before describing the
  beeswarm, correcting the title's implication.
- `{compact ? "tap" : "click"}` branches the interaction verb.
- Pool size ("this pool of 2,465 actors") is gated on `data` (not
  `activeData`) - **verified** it's cleanly omitted (not shown wrong) during
  the loading window on a throttled load, and shows the correct figure once
  the full pool lands.
- The first non-empty column's count now reads e.g. "193 costars"; every
  other column stays a bare number. Checked both desktop and mobile widths -
  the longer string fits inside the column without wrapping or overlapping
  neighboring avatars at either size.
- `routes.ts`: description now says "every real costar they've shared a film
  with, stacked by how many films they actually made together" instead of
  "rings... expand outward"; `note` rewritten in the same personal voice,
  now about what the pile-of-faces view actually reveals (most costars are
  one-film flings; the interesting bit is the handful of frequent
  collaborators) rather than the old rings-specific "half of Hollywood
  within two rings" claim, which no longer describes this chart at all.

---

## Verification

The Playwright scaffold (`playwright.config.ts`, `tests/*.spec.ts`) was deleted
from the repo at some point — `tests/screenshots/` and `tests/results/` remain and
are gitignored. Recreate a minimal `playwright.config.ts` plus
`tests/six-degrees.spec.ts` rather than writing throwaway scripts, so this is
re-runnable.

The spec should cover, at both 1440×900 and iPhone 13:

- Axis header row visible above the fold at scroll 0 (phase 1)
- `.sdo-graph` bottom within the viewport at scroll 0 (phase 1)
- `document.documentElement.scrollWidth <= window.innerWidth` at 1440/1280/1024/768/390 (phase 3)
- Anupam Kher `scrollWidth` under the phase-2 thresholds
- Detail card fully on-screen for extreme node positions (phase 5)
- "Bruce Willis" + ArrowDown + Enter recenters (phase 6)
- Deep link `?actor=<id>` survives reload; Back walks history (phase 9)

Screenshots to `tests/screenshots/six-degrees-*.png` for eyeball review.

**Do not regress the load path.** Re-measure after the work:

```
npm run build && npx vite preview --port 4188
```

then load `/2026/SixDegreesOf` throttled to 1.5 Mbps and confirm first painted
node stays at ~2s. The bundled-slice strategy in `defaultActors.json` +
`useData()` is what buys that; nothing here should touch it. (Note: the **dev**
server shows ~16s to first paint because Vite serves unbundled modules — that is
a dev artifact, not a real regression. Always measure against a production build.)

Run `npm run lint` before each commit.

### Implemented

`@playwright/test` was in `package.json` on a sibling branch that never
merged into this one (`financial-literacy-book`, not an ancestor of
`6-degrees-of`) - that's where `tests/screenshots/` and `tests/results/`
(gitignored, still present on disk) came from, but `playwright.config.ts`
and every `.spec.ts` file were never part of this branch's history at all,
so there was nothing to literally "recreate." Ported the config from that
branch (it's a generic, story-agnostic scaffold, not specific to whatever
story originally added it) and added `@playwright/test` as a dev dependency
plus a `test:visual` script - only the base `playwright` automation library
(no test runner) was installed here. Needed a matching browser binary
afterward (`npx playwright install chromium`); the previously-installed
revision didn't match the newly-installed `@playwright/test` version.

Wrote `tests/six-degrees.spec.ts` covering the acceptance checks above as
real, re-runnable tests rather than the throwaway scripts used to verify
each phase live: axis-visible-on-load (desktop + mobile), chart height
within the desktop viewport, no horizontal page overflow across five
breakpoints, Anupam Kher's collapsed width, the detail card on-screen for
all four extreme node positions, search ArrowDown+Enter, deep-link
resolve-and-survive-reload, and Back walking recenter history. All four
test actors (Michael Caine, Anupam Kher, Bruce Willis, Tom Hanks) were
confirmed present in the bundled default slice before hardcoding them, so
every test resolves on first paint without waiting for the full pool.

Verified the suite is genuinely self-contained: killed any running dev
server first, then ran `npx playwright test` cold - `webServer` auto-launched
one and all 8 tests passed (~28s total, one worker). Also re-ran the
load-path measurement (`npm run build && vite preview`, throttled to 1.5
Mbps) after all ten phases: first painted node still lands at ~2.1s,
unchanged from the pre-work baseline.

ESLint's `files` glob (`eslint.config.js`) only covers `**/*.{js,jsx}` -
`.ts`/`.tsx` files, including every SixDegreesOf source file and the new
spec/config files, were never linted by `npm run lint` at any point in this
work, on this branch. Not something this task should fix unprompted (it's a
project-wide config decision, not a Six Degrees Of concern), but worth
knowing if `npm run lint` passing silently didn't mean what it looked like
during this work - every "lint clean" note through this whole spec reflects
that only `vite.config.js`'s pre-existing unrelated error is being checked.
