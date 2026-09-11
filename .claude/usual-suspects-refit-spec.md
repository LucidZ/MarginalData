# The Usual Suspects — UI/UX Refit Spec

Route: `/2026/UsualSuspects` · Branch: `6-degrees-of` · Files: `src/2026/UsualSuspects/*`

This is the **second** UX pass on this story. The first is
`.claude/usual-suspects-ux-spec.md` ("UX fix gameplan"), whose phases all shipped —
it's kept as the record of why the earlier decisions were made, and several of the
invariants in §6 below trace back to bugs it fixed. Its measurements predate the
2026-09-09 pool regrowth and are stale; everything in *this* document was measured
fresh on 2026-09-11.

Every measurement below was taken from the running dev server on 2026-09-11 at 1440×900 and
390×844 (Chromium, DPR 2), against `?actor=nm0001191` (Adam Sandler) unless noted. Re-measure
after each phase rather than trusting these to still hold.

---

## 1. What's wrong today

Measured, not estimated:

| | Desktop 1440×900 | Mobile 390×844 |
|---|---|---|
| SVG rendered width | 2178px in a 1392px frame (**36% offscreen**) | 1583px in 342px (**78% offscreen**) |
| Render scale | **0.65** — pinned at `MIN_SCALE`, the floor | 0.65 |
| Faces in the "1 film" column | **~18 CSS px** after scale | ~18px |
| Chart's vertical budget | 486px of 900 | 368px of 844 |
| Chrome above the chart | 340px | 489px (**58% of the screen**) |
| Page *also* scrolls vertically | 1058px doc height | 1070px |
| Columns rendered | **26**, of which **13 empty**, 8 more hold ≤2 people | same |

Four distinct problems underneath those numbers:

**1a. The background bleed (a plain bug).** `.tus-root` paints `--page` (#0d0d0d in dark mode)
on a **1100px centered column** — measured at exactly 1100. `.tus-graph-frame` (App.css) then
breaks the chart out to full viewport width with `margin-inline: calc(50% - 50vw)`. Everything
outside that 1100px sits on the site `body`, which stays `rgb(255,255,255)` even under
`prefers-color-scheme: dark` (the site shell never goes dark; this story's dark mode is a
per-route opt-in via `.tus-root`'s own tokens). The scroll-edge gradients are painted in
`var(--page)` too, so outside the column they fade dark→dark against white and do nothing.

**1b. The reading column is the wrong shell.** `.tus-root`'s `max-width: 1100px; margin: 0 auto`
is the site's *article* wrapper, inherited from the scrollytelling stories. This page is an app —
a search field, a canvas, a detail card. It has no prose that needs a measure once §4 lands.

**1c. The axis spends its width on nothing.** A linear axis running 1..26 gives 13 empty
columns real footprint, and the axis label text ("12 films together" = **108px wide**, measured)
forces `minHalfWidth = (200 − 16) / 2 = 92` — a **184px minimum footprint per populated
column**, whether it holds 207 people or one. Sandler's frameWidth is **3351 viewBox units**
for 13 populated columns.

**1d. The payoff is offscreen.** The subtitle's own hook is Sandler/Covert, and Covert —
**26 films together**, the highest in the pool — is the rightmost column, 786px past the right
edge, behind a horizontal scrollbar most visitors never touch. Everything past 7 films is
invisible on load: Chris Rock & Kevin James (12), David Spade (13), Nick Swardson (15),
Steve Buscemi (16), Jonathan Loughran & Rob Schneider (23), Allen Covert (26). Ten people.
Meanwhile the 207 strangers Sandler made one film with get the largest, leftmost, most
prominent position, rendered as 18px mush.

---

## 2. Decisions taken (2026-09-11, with Lucas)

- **Axis runs descending** — most films together on the left. Rationale is *not* mainly
  hook-first: it's that the only region which can then fall off the right edge is the
  1-film crowd, the column that least rewards close reading. The chart can be clipped and
  still be complete.
- **Ordinal axis with gap breaks** — only populated counts get a column; a run of counts
  nobody has collapses to one narrow break marker. Exact numbers are preserved (26 stays 26);
  binning into "8+" was rejected for losing them.
- **Intro copy stays visible at every entry point**, including deep links — a shared
  `?actor=` URL is exactly when someone arrives cold. It earns its space by being generated
  from the chart on screen (§4), not by being hidden.

---

## 3. Layout target

### Desktop — app shell, `100dvh`, no page scroll

```
┌──────────────────────────────────────────────────────────────┐
│ Marginal Data                                                │ 51px site nav
├──────────────────────────────────────────────────────────────┤
│ The Usual Suspects  [🔍 Type an actor's name…] [Shuffle] [ⓘ] │ 56px toolbar
├──────────────────────────────────────────────────────────────┤
│ (◉) Adam Sandler and Allen Covert made 26 films together.    │
│     Some actors share the screen far more than others.       │ ~70px context
│     278 costars across 2,839 actors.           26–7 of 26 →  │
├──────────────────────────────────────────────────────────────┤
│  26    23    16  15  13  12 ⋮  7    6    5    4    3     2   │
│   1     2     1   1   1   2 ⋮  2    2    4    2    7    46   │
│                                                              │
│  ◯    ◯◯    ◯   ◯   ◯   ◯◯ ⋮ ◯◯   ◯◯  ◯◯◯◯  ◯◯  ◯◯◯   ▓▓▓  │ ~700px
│ Covert                                                   ▓▓▓ │
│  ‹                                                        ›  │
└──────────────────────────────────────────────────────────────┘
      hover chevrons          ↑ edge peek, never a clean cut
```

Making the chart's horizontal scroll the page's *only* scroll removes the current trackpad
ambiguity (shift+wheel vs. page scroll) as a side effect.

### Mobile — sticky chrome over natural vertical scroll

Do **not** lock mobile to `100dvh`. Rotate the axis so film-count runs *down* the page and each
row's swarm packs across the full width; the page scroll then *is* the chart scroll, and
horizontal scroll disappears entirely.

```
┌──────────────────┐
│ 🔍 Search  ⇄  ⓘ │ ← sticky
│ (◉) Adam Sandler │ ← sticky
├──────────────────┤
│ 26 films  Covert │
│      ◯           │
│ 23 films       2 │
│    ◯   ◯         │
│ 16 films       1 │
│      ◯           │
│  ⋮ 14, 17–22     │
│  2 films      46 │
│ ◯◯◯◯◯◯◯◯◯       │
│  1 film      207 │
│ ●●●●●●●●●●●● ↓   │
└──────────────────┘
```

The 207-person row becomes ~800px of ordinary vertical scrolling instead of 1583px of sideways
travel nobody discovers.

---

## 4. Copy: generate the hook from the chart

Replace the five-line paragraph with three layers.

**Layer 1 — headline, generated per root actor.** Template:
`"{Root} and {top collaborator} made {n} films together."`

Verified against the full pool (`public/data/usual-suspects-pool-a.json`, 2,839 actors):

| Root | Generated headline |
|---|---|
| Adam Sandler | "Adam Sandler and Allen Covert made 26 films together." |
| Tom Hanks | "Tom Hanks and Tim Allen made 8 films together." |
| Keanu Reeves | "Keanu Reeves and Laurence Fishburne made 8 films together." |
| Emma Stone | "Emma Stone and Ryan Gosling made 4 films together." |
| Christian Bale | "Christian Bale and Michael Caine made 4 films together." |

**86.2% of the pool (2,446 of 2,839) has a top collaborator at 2+ films**, so the sentence
lands. Distribution of each actor's own top shared-film count:

| top = | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11+ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| actors | 393 | 604 | 641 | 460 | 253 | 168 | 88 | 67 | 48 | 34 | 83 |
| % | 13.8 | 21.3 | 22.6 | 16.2 | 8.9 | 5.9 | 3.1 | 2.4 | 1.7 | 1.2 | 2.9 |

**Fallback for the 393 whose top is 1 film** — all obscure, low-degree, unreachable by Shuffle
(it draws from `defaultActorIds`), reachable only by search:
`"{Root} appears here with {N} costars — one film each."` (e.g. Sebastian Shaw, 23 costars.)

**Tie-break is free:** pool ids are sorted by costar degree (see the `rootId` comment in
App.tsx), so breaking ties on the lower id picks the more recognizable name — Sandler's 23-film
tie resolves to Rob Schneider, not Jonathan Loughran.

This headline *is* the caption for the leftmost column under descending order. The sentence and
the first thing the eye hits are the same fact.

**Layer 2 — framing + scope, static, always shown.** "Some actors share the screen far more
than others. {N} costars across 2,839 actors." Keep the 2,839 gated on the full pool having
loaded, as today — the bundled slice's 1,612 is real but wrong for that claim.

**Layer 3 — instructions, moved to a hint strip on the chart**, where the action is. Persists
until the first click, then gone for the session. It's onboarding, not permanent copy.

**ⓘ** holds the method note, data source, and what "shared film" counts as.

**The four-pair opener stays on the bare landing state** (no `?actor=`) — it's good writing and
a real cold open. But its numbers are stale and must be re-verified before it ships again:

| Pair | Comment in App.tsx says | Actually (verified 2026-09-11) |
|---|---|---|
| Gosling / Stone | 3 | **4** |
| Johnson / Hart | 4 | **5** |
| Reeves / Ryder | 3 | **4** |
| Sandler / Covert | 10 | **26** |

Commit `4bc930f` (TMDB credit supplementing) moved all four. Also note Reeves' actual top
collaborator is Laurence Fishburne at 8, not Ryder — the curated pairs are chosen for
recognizability, which is a fine reason, but the comment's claim that they're verified
headline numbers is no longer true.

---

## 5. Phases

### Phases 1-2: BUILT 2026-09-11. Measured results

| Adam Sandler, 1440x900 | before | after |
|---|---|---|
| SVG width | 2178px (36% offscreen) | **1547px** (155px, 10% offscreen) |
| Render scale | 0.65, pinned at the floor | **0.903** |
| Faces, largest column | ~18px | **24px** |
| Faces, tail columns | 57px | **60px** |
| Columns | 26 (13 empty) | **13 + 4 break marks** |
| Chrome above the chart | 340px | **194px** |
| Chart height budget | 486px | **682px** |

Swept 42 actors (top-degree, the gap-heavy cases, and random draws) at 1440x900:
**no actor pins MIN_SCALE any more** (worst is Samuel L. Jackson at 0.686, floor is
0.65), **none runs below the fold**, and the widest remaining horizontal overflow in the
sample is Sandler's 155px. Tom Hanks, Christian Bale, Michael Caine, Willem Dafoe and
De Niro now fit with zero overflow.

Three things were found and fixed along the way that weren't in the original plan:

1. **The height budget never applied to ~25% of actors.** The `available` measurement ran
   once in a `useLayoutEffect` keyed on `[compact]`, found `frameRef.current` null because
   the frame renders inside `{root && ...}`, and bailed — permanently, since nothing re-ran
   it. That hit every actor the bundled slice doesn't cover (720 of 2,839) and every
   fallback from an invalid `?actor=`, which render "Loading this actor…" on first commit
   and the frame only on a later one. Those charts got no height budget at all: measured
   941px tall on a 900px viewport, running below the fold, while slice actors sized
   correctly — a bug that reads as a data difference. Now a callback ref drives the effect.
2. **The side margin collapsed to zero at the crowded end.** `viewLeft`/`viewRight` took
   `Math.max(sideMargin, endColumn.halfWidth)`, so whenever an end column's swarm was wider
   than the margin there was no margin. Invisible under the ascending axis (the ends were
   one- and two-person columns, halfWidth ~32); a real bug the moment descending put the
   200-plus-person 1-film crowd at the right end (halfWidth ~141). A click in apparent empty
   space past the chart resolved to the nearest face instead of dismissing the open card.
   Now additive: `halfWidth + sideMargin`. Costs ~100px of width, worth it.
3. **`maxNodeSize` 88 → 64** as planned, and `sideMargin` 120 → 64 (now additive).

`tests/usual-suspects.spec.ts`: **22/22 passing, confirmed stable across two consecutive
full runs.** Five changes, none of which weaken an assertion:

- `.tus-root-meta` → `.tus-context-meta` (the element carrying the costar figure moved).
- `.tus-root-name` was restored as a real element in the markup rather than changed in the
  test — the root's name is rendered separately from the generated headline predicate, so
  the line still reads as one sentence while staying addressable.
- `scrollToDensestColumn()` added before the two click-accuracy tests sample. They were
  written when ascending order put the 1-film column leftmost and therefore on screen at
  rest; descending opens on one- and two-person columns, so at 390px fewer than 20 nodes
  were in view and the tests were sampling almost nothing.
- The gap-click test now sorts candidates by **radius ascending** instead of DOM order.
  Same cause: DOM order used to start in the dense column. Under descending it starts at
  `maxNodeSize` avatars, where a point 3px outside a 32px radius is further from the center
  than both that radius and `MIN_MATCH_RADIUS` — so every sampled point was skipped and the
  test silently checked nothing. Sorting by radius targets dense packing directly, which is
  what the test is about, and is indifferent to axis direction.
- `waitForFullPool()` extracted and added to the empty-space test, which captured the svg's
  right edge and then clicked it without waiting for the bundled-slice → full-pool swap.
  That was **flaky, not wrong** — it passed and failed on consecutive runs of identical
  code. Descending made it likelier: the column that grows most when the full pool lands is
  the 1-film crowd, which descending puts at the right edge, so the geometry this test
  measures is now the part that moves furthest.

**Not achieved:** `scale` is 0.69–0.90, not 1.0. Once a bucket's computed diameter hits
`minNodeSize`, the packed column's height stops responding to `targetColumnHeight`, so
`packColumn` overshoots the budget by a variable amount and the uniform scale closes the
rest. That's the designed fallback, and the thing that actually mattered — MIN_SCALE
clamping and clipping content off the bottom — no longer happens to anyone.

---

**Phase 1 — full-bleed app shell.** Move the dark surface off the 1100px column onto a
full-bleed wrapper; `100dvh` shell on desktop, sticky chrome on mobile; delete the
`margin-inline: calc(50% - 50vw)` breakout (unnecessary once nothing is narrower than the
viewport). Fixes 1a and 1b, and releases the `MIN_SCALE` clamp: the chart's height budget goes
from 486px to ~700px, which alone takes `scale` from 0.65 to 1.0 and the big column's faces
from 18px to ~27px.

**Phase 2 — axis rework** (`beeswarm.ts`, `graph.ts`). Descending order; ordinal columns;
collapse runs of empty counts to a single break marker; bare-number labels with one axis title,
dropping `minHalfWidth` from 92 to roughly the number's own width.

Projected for Sandler, from the measured per-column swarm widths
(248 + 184 + 180 + 91×10 = 1522 units of swarm, 12 gaps × 16, 4 break marks × 24, ~100 margins):

| | now | after phase 2 |
|---|---|---|
| Columns | 26 (13 empty) | 13 + 4 break marks |
| Width | 3351 units @ 0.65 = 2178px | **~1910px @ 1.0** |
| Overflow in a 1392px frame | 786px (36%) | ~518px (27%) |

That residual 518px is one specific thing: **ten tail columns holding one or two people each at
`maxNodeSize: 88`** — 910 units, 48% of the chart, for 10 faces. Dropping `maxNodeSize` to ~64
(still large and plainly recognizable) gets to ~1670px, about two columns of overflow, which is
exactly what a peek + chevron handles gracefully. Christian Bale (600px today) and Tom Hanks
(1182px) already fit outright — **Sandler is the pool's worst case, not the norm.**

### Vertical rewrite: BUILT 2026-09-11 (supersedes phases 3 and 5)

Lucas proposed rotating the whole thing — film count down the page, faces packed across
each row, most-shared at the top — and it beat the horizontal version on every axis that
mattered. Modelled against the pool before building, then built.

**Zero horizontal scroll at any viewport, for any actor.** Measured after the rewrite:

| Actor | desktop chart | mobile chart | names shown |
|---|---|---|---|
| Adam Sandler | 1392x1609 | 342x2244 | 25 |
| Tom Hanks | 1392x1222 | 342x1402 | 4 |
| Samuel L. Jackson | 1392x1601 | 342x2362 | 14 |
| Christian Bale | 1392x716 | 342x740 | 1 |
| Anupam Kher | 1392x1078 | 342x1175 | 14 |

Worst case in the sample is ~2.7 screenfuls of ordinary vertical scrolling on a phone,
against 945px of undiscoverable sideways travel before. The closest-collaborator row is
above the fold at both viewports for every actor tested.

**Why it's the right shape for this data.** Across the 1,823 actors with 3+ rows,
**84.3% widen monotonically top to bottom** — the pyramid is real, not a metaphor being
forced. The caveat to go in knowing: the median actor has **84% of their costars in the
bottom (1-film) row** and **a third of their rows holding one or two people**, so it reads
as a thin named stem over a thick anonymous slab rather than an even pyramid.

**What the rotation bought that the horizontal version couldn't reach.** Rows with <=8
people (`NAMED_ROW_MAX`) render as face-plus-name chips, so everyone worth recognizing is
named on arrival with no hover and no click — Sandler shows 25 names above the crowd. And
row labels are words again ("26 films together"), because a left gutter costs no vertical
space; the column version had to cut that same label to a bare number because its 108px
width forced a 184px minimum footprint per column.

**It also collapsed two planned phases.** Phase 3 (a separate rotated mobile layout) is
gone — this is one layout for both. Phase 5 (snap-peek, hover chevrons, scroll counter) is
mostly moot, since nothing is offscreen horizontally to cue.

Three bugs found during the rewrite, all of which the horizontal layout had been hiding:

1. **Clicking anywhere on the chart snapped the page to the top.** A click focuses the
   `<svg>`, whose focus handler hands focus down to the current node — index 0, the top row
   — and a bare `.focus()` scrolls that node into view. Harmless while the chart fitted one
   screenful with nothing to scroll; the single most obvious bug on the page once rows made
   it taller than the viewport. Fixed with `focus({ preventScroll: true })` in both the
   focus handler and `focusNodeAt` (which keeps its own explicit `scrollIntoView`).
2. **133px of dead space above the first row on mobile, 26px on desktop.** The width
   measurement used `clientWidth`, which includes the frame's padding, so the viewBox came
   out wider than the svg's rendered width and `preserveAspectRatio` scaled the chart down
   and centred it vertically inside the height we'd asked for. Fixed by measuring the
   content box; `preserveAspectRatio="xMinYMin meet"` added as a backstop.
3. **A named node's bounding-box centre wasn't clickable.** The name sits beside the face,
   so the `<g>`'s centre falls in the gap between them, on the background overlay. Fixed in
   the product rather than the test — the hit area now spans face and name, since they read
   as one unit — bounded to the chip's cell minus a gap so it still can't reach a
   neighbour's target (invariant 3).

Tests: **22/22, stable across two consecutive full runs.** The suite needed real work,
because several tests encoded assumptions the rotation reversed: probe the hit circle
rather than the `<g>` bbox (see bug 3), scroll the *page* to reach the dense rows rather
than a scroll container, hover tests must target an unnamed node (the readout is suppressed
where a name is already shown), the axis-header test became a first-row test, and
"chart bottom stays within the viewport" became "the chart never exceeds its frame's
width" — the old assertion was correct for a chart squeezed below a header and is wrong by
design now.

---

### Phases 4 and 6: NOT STARTED — handoff

Phases 1-2 are done and verified; the rest is the handoff scope. Read §6 before touching
`App.tsx` or `App.css`.

**Phase 3 — superseded.** The vertical rewrite is the mobile layout, and the desktop one.

**Phase 4 — copy per §4.**

**Phase 5 — overflow cues.** Snap-peek so a column edge always shows (never a clean cut);
hover chevrons, desktop only; a "26–7 of 26 →" counter chip. All three only work once phase 1
makes the gradients legible.

**Phase 6 (stretch) — recenter as navigation.** FLIP transition where shared costars slide to
their new columns and the rest fade, instead of the current hard cut. Highest polish-per-effort
item on the list, and the biggest single thing that would make it feel like one continuous
space rather than a page load.

Also agreed, unscheduled: the detail card becomes a right-side slide-over inspector (deletes
DetailCard.tsx's position-correction math; under descending order it overlays the 1-film crowd,
the region least worth covering), and the axis break marker uses the print convention for a
broken axis.

---

## 6. Invariants — do not undo these

App.tsx and App.css carry ~15 load-bearing comments, most documenting a bug that was already
fixed once. These are the ones this refit will touch or tempt you to touch:

1. **`justify-content: safe center`** on `.tus-graph-scroll`. Bare `center` is a shipped bug
   that was already caught: it centers even when the item overflows, putting half the overflow
   before the container's start edge where `scrollLeft` can't reach it. Measured on Robert
   Downey Jr. mobile — 161px, the entire first column, permanently unreachable. If phase 1
   changes this container, keep `safe`.
2. **`?actor=` keys on IMDb nconst, never the pool's numeric id.** Pool ids are positional and
   get reshuffled by any regeneration (id 98 went from Ethan Hawke to Adam Sandler on
   2026-09-09). Every shared link would silently point at a different actor.
3. **Per-node hit circles sized to the visible radius + the nearest-center overlay.** The old
   inflated 44px minimum touch target blanketed neighbors; 66–89% of in-view nodes were
   unreachable at their own center. `tests/usual-suspects.spec.ts` regression-tests this.
   Changing avatar sizes in phase 2 must keep that test green.
4. **`frameRef` measures `.tus-graph-frame`'s top, not the inner scroll div**, and depends only
   on what's above it — never on the chart's own height. Feeding chart height back into the
   height budget would oscillate.
5. **The root banner `<img>` is keyed by its own src** so a recenter remounts it. A bare src
   swap keeps painting the previous actor's face next to the new actor's name until the new
   one decodes — blank reads as loading, the wrong person reads as broken.
6. **Roving tabindex**: the `<svg>` is the single tab stop, nodes are `tabIndex={-1}`, and
   `flatNodes` is column-major with each column's entries contiguous — `moveWithinColumn`
   depends on that contiguity. Reordering columns in phase 2 must preserve it.
7. **`role="group"`, not `role="img"`**, on the svg — `img` hides every node's
   `role="button"` from assistive tech.
8. **The bundled `defaultActors.json` slice renders before the ~3MB pool fetch lands.** Any new
   derived value (the §4 headline included) needs to be correct against the slice *and* the
   full pool, or gated on `data` like the 2,839 figure already is.

---

## 7. Verification

`npm run test:visual` must stay green throughout — `tests/usual-suspects.spec.ts` already covers
the clickability regression at both viewports on the two densest charts (Keanu Reeves, 351
nodes; Samuel L. Jackson, 196).

Per phase, re-measure at 1440×900 and 390×844 and record: rendered SVG width vs. frame width,
`scale`, avatar diameter in the largest column, chrome height above the chart, and whether the
document scrolls vertically. Phase 1 is only done when `scale` is 1.0 for Sandler and the page
does not scroll on desktop.

Spot-check actors that exercise different shapes: **Anupam Kher** (the most gap columns),
**Michael Caine** (widest chart pre-refit, 1228px), **Christian Bale** (4 columns, already
fits), **Aamir Khan** (small pool, 3 costars in his top column), **Samuel L. Jackson** and
**Willem Dafoe** (the two that pin `MIN_SCALE` today).
