# The Usual Suspects — UX improvement plan

Route: `/2026/UsualSuspects` · Source: `src/2026/UsualSuspects/` · Branch: `6-degrees-of`

Goal stated by Lucas: **"speed is part of the joy of exploration."** Every item below is
scored against that — how fast can someone go from landing on the page to recognising a
face, understanding why it's there, and jumping to the next one.

This plan comes out of a measured audit (Playwright, both viewports, throttled network).
The numbers in each section are real measurements, not estimates — **don't re-derive them,
they're here so you can go straight to the fix.** Where a number needs re-checking after a
change, the acceptance criteria say so.

Phases are ordered by leverage. **Phase 1 and 2 compound — do them in order.** Phase 3 items
are independent quick wins and can be done in any order, or in parallel with 1–2. Phase 4 is
a design change, not a bug fix: propose it before building it.

---

## Read this first: relationship to `.claude/usual-suspects-ux-spec.md`

That document is the **completed** 10-phase UX pass, all phases implemented and verified. It
is history, not a competing plan — but two of its decisions interact with this one, and you
need to know that before you touch either.

**Phase 1 below deliberately reverses that spec's Phase 8.** Phase 8 added the inflated hit
circle and states outright: *"Overlapping hit areas are fine here: the topmost element in
document order wins, and the card immediately tells the user who they got. Do not try to
prevent overlap."* That was a reasonable call at the time, and its acceptance criteria passed
honestly — it verified every hit circle measured ~44×44 CSS px, and it does. What it never
checked was whether a node **owns its own centre**, which is the thing that actually
determines whether you get the face you aimed at. It doesn't: 71% desktop / 82% mobile don't.

Phase 8's *goal* — forgiving targets for sub-44px avatars — is correct and is preserved here.
Only the geometry changes. Overlapping discs can't partition a plane; a nearest-centre
partition gives every node a forgiving cell that provably can't steal a neighbour's. Say so in
the commit message so the reversal reads as a refinement of Phase 8's intent rather than an
undo of it.

**Do not undo that spec's Phase 8 `justify-content: safe center` fix.** It's an unrelated,
hard-won bug fix living in the same phase: bare `center` geometrically centres an overflowing
flex item, which put 161px of Robert Downey Jr.'s mobile chart permanently off-screen at a
`scrollLeft` that can't go negative. If you touch `.tus-graph-scroll` for the mobile
scroll-position item in Phase 4, keep the `safe` keyword.

Elsewhere this plan builds on that spec rather than revising it — the uniform header row,
empty-column collapse, viewport clamp, card positioning, keyboard nav and URL scheme are all
its work and all still correct.

---

## Phase 1 — Fix node hit-testing (the blocking bug)

### What's wrong

`ActorNode.tsx` gives every node an invisible hit circle inflated to a 44px touch target:

```tsx
hitRadius={Math.max(p.size / 2, MIN_HIT_RADIUS / scale)}   // App.tsx
<circle r={hitRadius} fill="transparent" pointerEvents="all" />   // ActorNode.tsx
```

In the dense columns the avatars are packed far tighter than 44px, so those circles blanket
each other and whichever `<g>` paints last swallows the clicks underneath it.

| | avatar Ø | hit circle Ø | median nearest-neighbour gap |
|---|---|---|---|
| desktop, "1 film" column | 16.9px | 44px | 17.6px |
| mobile, "1 film" column | 11.4px | 44px | 12.2px |

Audited with `document.elementFromPoint` at every node's own centre:

```
desktop  Keanu Reeves       140/196 (71%) of in-view nodes unreachable at their own centre
desktop  Samuel L. Jackson  227/346 (66%)
desktop  Adam Sandler        63/126 (50%)
mobile   Keanu Reeves       159/195 (82%)
mobile   Samuel L. Jackson  287/324 (89%)
mobile   Adam Sandler        84/116 (72%)
```

Playwright can't even hover a specific node — it reports
`<circle ...> from <g aria-label="Gene Hackman ...">  subtree intercepts pointer events`
when asked to hover Gary Oldman. The existing test suite already works around this: see
`leftmostAndRightmostClickable()` in `tests/usual-suspects.spec.ts`, whose comment documents
the overlap, and the `click({ force: true })` calls throughout.

`MIN_HIT_RADIUS` was the right instinct — small avatars *do* need forgiving targets — but
implemented with the wrong geometry. Overlapping discs can't partition a plane. A Voronoi
partition can.

### The fix

Two complementary pieces:

**1a. Hit area = the visible avatar.** Delete the `hitRadius` prop and the transparent
`<circle>` from `ActorNode.tsx`; delete `MIN_HIT_RADIUS` and its call site in `App.tsx`.
`packColumn` uses `forceCollide(d => d.r + 1)`, so node centres are always ≥ `2r + 2` apart —
no node's own disc can cover a neighbour's centre. This alone takes mis-targeting to zero.

**1b. Nearest-centre overlay for the gaps.** Add a transparent full-viewBox `<rect>` as the
**first** child of the `<svg>` (behind every node, in front of the baseline). On click it
resolves to the node whose centre is nearest the pointer:

- Convert client → viewBox coords with `pt.matrixTransform(svg.getScreenCTM()!.inverse())`.
  Do **not** hand-roll the maths off `getBoundingClientRect` — the SVG carries a uniform
  `scale` (see `App.tsx`), and the CTM already accounts for it.
- Linear scan over `flatNodes` for the nearest centre. Max node count is 351 (Samuel L.
  Jackson); a 351-item distance scan per event is free. Only reach for `d3`'s `quadtree`
  (already bundled) if a profile says otherwise — it won't.
- **Cap the match distance** at `Math.max(node.size / 2, 24)` viewBox units. Without a cap, a
  click in the empty right-hand whitespace grabs a node 300px away. With it, a miss resolves
  to nothing and the click falls through — which is what closes an open card.
- Route the overlay's click through the *same* `onSelect` path `ActorNode` uses, so the
  capture-phase outside-click swap in `DetailCard.tsx` keeps working unchanged.

Behind rather than on top is deliberate: a pointer directly over an avatar hits the avatar
(so `elementFromPoint`, Playwright actionability, and the existing tests all keep working),
and only pointers in the packing gaps fall through to the overlay.

### Acceptance criteria

- Add a permanent regression test to `tests/usual-suspects.spec.ts`: for Keanu Reeves and
  Samuel L. Jackson, at both `DESKTOP` and `MOBILE`, **≥95% of in-view nodes own their own
  centre** under `elementFromPoint`. (Use the audit snippet's shape: `el?.closest(".tus-node") === n`.)
- Simplify `leftmostAndRightmostClickable()` to a plain leftmost/rightmost bounding-box pick
  and drop its workaround comment — the thing it works around is gone.
- Drop `force: true` from the node clicks in the existing tests. If any click still needs it,
  the fix is incomplete.
- Clicking in the whitespace between two avatars still opens the nearer one's card.
- Clicking in the empty region right of the last column opens nothing and closes any open card.
- Keyboard nav is untouched: the `<svg>` is still the only tab stop, arrows still move focus.

---

## Phase 2 — Instant hover readout (desktop)

### What's wrong

Hovering a node only recolours its ring (`App.css:335`). The name comes from the SVG
`<title>` element — a native OS tooltip with a ~1s delay. You cannot sweep the mouse across
169 faces and read who they are. Every identification costs a full click → card → close cycle.

### The fix

With Phase 1's nearest-centre resolution already computing "which node is the pointer
nearest", hover is nearly free. Render a label as the **last** child of the `<svg>` (topmost),
`pointer-events="none"`, showing `Name · N films`.

Critical constraints — the previous hover tooltip was removed for specific reasons, recorded
at `App.css:382`. Respect both:

- **Anchor to the node, not the cursor.** The old one re-positioned on every `mousemove`, so
  it fled from the pointer. Anchor it to the hovered node's own `x`/`y`.
- **Keep it non-interactive.** The old one held links that were therefore unreachable. This
  one is text only. Links, posters and "Center on" stay in the click-opened card, which is
  still the only interactive surface.

Implementation notes:

- Size the font as `13 / scale`. The SVG is uniformly scaled (0.65–1.0 via `MIN_SCALE`), so a
  raw `13` renders at 8.5px on the tallest charts.
- Backdrop `<rect>` behind the text; estimate width as `name.length * fontSize * 0.55`. Good
  enough — don't measure via `getComputedTextLength`, it forces layout on every pointermove.
- Default above the node; flip below when it would cross `frameMinY`. Clamp x within
  `[viewLeft, viewRight]`.
- **Gate on `window.matchMedia("(hover: hover)")`**, not on `compact`. A tablet is wide enough
  to be non-compact but still has no hover, and the label would flash on every tap.
- Clear the hovered state on the `<svg>`'s `pointerleave`.

### Acceptance criteria

- Moving the pointer across the dense column updates the label with no perceptible lag and no
  click required.
- The label never sits under the cursor and never intercepts a click (verify a click at a
  point covered by the label still selects the node beneath).
- On a touch emulation context the label never appears.
- The click-opened card is unchanged.

---

## Phase 3 — Independent quick wins

Each is self-contained. None depend on Phase 1 or 2.

### 3a. Root banner shows the *previous* actor's face — `App.tsx`

Verified: after Shuffle, `name="Michael Caine"` renders next to Keanu Reeves' photo, and
persists for as long as the new image takes to decode (still wrong at 3s on a 1.6Mbps
throttle). The `<img>` element is reused across recenters, and browsers keep painting the old
bitmap through a `src` swap — instrumented as `complete=false, naturalWidth=0` the whole time
the old face is on screen.

Fix: `key={rootPhoto}` on the `.tus-root-photo` `<img>` so it remounts. Blank is correct;
the wrong person is not.

### 3b. Loading avatars render as nothing — `ActorNode.tsx`

The `tus-node-fallback` circle only renders when `actor.photo` is null. An actor who *has* a
photo that hasn't decoded yet draws nothing at all, so a freshly recentered chart reads as
broken rather than loading. On a throttled connection the "2 films together" column was
33/34 empty at the 3-second mark.

Fix: always render `<circle className="tus-node-fallback" r={r} />` beneath the `<image>`.
One line, and the chart reads as filling in.

### 3c. Search misses ordinary queries — `SearchBox.tsx`

Currently a contiguous-substring match with lowercase-only normalisation. Verified failures:

```
"samuel jackson"  → nothing        (he's "Samuel L. Jackson")
"Penelope Cruz"   → nothing        (needs the é)
"deniro"          → nothing
"tom"             → Marisa Tomei ranked above Tom Hardy
```

Fix, in the `matches` memo:

1. Normalise both sides with `.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()`.
2. Split the query on whitespace and require **every token** to appear somewhere in the
   normalised name, instead of matching one contiguous run. Rescues all three misses; `"tom h"`
   keeps working.
3. Rank prefix matches (name, or any word in it, starts with the first token) ahead of
   interior ones. `actors` arrives pre-sorted by co-star degree — preserve that as the
   tiebreak within each rank tier.

Precompute the normalised names once per `actors` array, not per keystroke — it's 2,839 rows.

Keep the existing `status`-driven empty-state messages exactly as they are; the
loading/error/ready distinction is load-bearing (see the comment on the `status` prop).

### 3d. Search results are names only — `SearchBox.tsx`

The whole page is faces; the one place you're asked to recognise a name has none. Add the
w92 thumbnail (`photoUrl(actor, 24)`) to each result row. Keep the row a single button and
give the `<img>` `alt=""` — the button's text is already the accessible name.

### 3e. Dark-mode h1 is nearly invisible — `src/index.css`

`--color-heading: #1e3a5f` on the page's `#0d0d0d` measures **1.69:1**. WCAG wants ≥3:1 for
large text. There is no dark-mode override for `--color-heading` anywhere sitewide, so this
affects every page, not just this route.

Fix at the sitewide level — add a `@media (prefers-color-scheme: dark)` block plus the
matching `:root[data-theme="dark"]` rule in `src/index.css`, following the exact pattern
`.tus-root` already uses in `App.css:20-41` (both selectors, so an explicit theme choice wins
in both directions). Pick a heading colour that clears 4.5:1 on `#0d0d0d`. Spot-check two
other routes before and after so this doesn't regress a page it wasn't aimed at.

### 3f. Warm the next actor's avatars — `App.tsx`

Every recenter fetches ~200 fresh TMDB avatars (~650KB) and the chart fills in over seconds.
When a detail card opens you already know the likely next action is "Center on X".

Fix: when `selection` changes, warm that actor's costar photos in the background — walk
`adjacency.get(selection.actor.id)`, take the first ~60 by weight, and `new Image().src =
photoUrl(a, 24)` inside a `requestIdleCallback` (with a `setTimeout` fallback for Safari).
Cap it so it never competes with the current view's own images, and skip entirely when
`navigator.connection?.saveData` is set.

---

## Phase 4 — Demote the "1 film together" column (design change, propose first)

**Don't build this without checking in.** It changes what the chart means, not just how it
behaves.

### The case for it

Across all 1,944 pool actors with more than 20 costars, the **median actor has 91.8% of their
costars in the "1 film together" bucket** (mean 91.0%). Sharing exactly one film is the
definition of having been in a movie together — it isn't a finding. Yet that column takes
~60% of the chart width and ~92% of the faces, while the actual payoff (Laurence Fishburne at
6 films with Keanu) is one lonely avatar at the right edge.

It's also where the Phase 1 bug was worst, and where avatars shrink to 11px on mobile.

### The proposal

Collapse the 1-film bucket into a compact tile — `169 others · one film each` — that expands
on click, and give the reclaimed width and height to columns 2+ so those avatars get
materially bigger. Everyone stays present and reachable; the default view just leads with the
part that carries information.

Knock-on effects to think through before building:

- `layoutBeeswarm` currently derives column x-positions from packed half-widths; a collapsed
  column needs its own width rule alongside `EMPTY_COLUMN_HALF_WIDTH`.
- The `firstLabeledColumnFilms` logic in `App.tsx` puts the "costars" unit on the first
  populated column — that's the collapsed one under this change.
- The existing test *"axis header is visible above the fold on load"* and the Anupam Kher
  width test both need re-checking.
- Expanded state should probably not persist across recenters.

### Related, smaller, and safe to do independently

**Reclaim vertical space above the chart.** Measured chrome above the chart frame:

| viewport | chrome above chart | share of viewport |
|---|---|---|
| desktop 1440×900 | 390px | 43% |
| laptop 1280×720 | 390px | **54%** |
| mobile 390×844 | 489px | **58%** |

On mobile that means scrolling past eight lines of copy, then again to see the baseline, then
sideways (508px of content in a 342px scroller) to reach the right-hand columns. Three axes of
friction before exploration starts.

Suggested: collapse the four-line subtitle to one line after the first interaction (search,
shuffle, or any node click). It's read once but costs vertical space on every session. Keep
the full copy on first paint — it carries the hook, and `SUBTITLE_ACTOR_NCONSTS` depends on
those eight names being on screen at load.

**Mobile horizontal start position.** The interesting columns are the ones off-screen by
default, hinted only by an edge gradient. Consider opening `.tus-graph-scroll` scrolled to its
right edge on compact, so the rare/high-count end leads.

---

## Invariants — do not break these

Each is load-bearing and has its reasoning recorded in a comment at the cited location. If a
change here seems to require breaking one, stop and flag it.

- **`?actor=` keys on IMDb nconst, never the pool's numeric ids.** Pool ids are positional and
  get reshuffled by any regeneration. `App.tsx`, the long `rootId` comment.
- **Interior empty columns are preserved; only the empty tail is trimmed.** A gap is real
  information. `beeswarm.ts`, `layoutBeeswarm` docblock.
- **`MIN_SCALE = 0.65` is a legibility floor, not a fit guarantee.** Charts that need more
  shrinking scroll vertically instead. Re-measured 2026-09-09; don't lower it to force a fit.
- **`defaultActors.json` is the first-paint path.** The bundled slice renders before the ~3MB
  pool fetch lands, and `data ?? defaultActors` swaps to the full graph invisibly. Don't
  introduce anything that blocks first paint on the fetch.
- **`SUBTITLE_ACTOR_NCONSTS` must list exactly the eight actors named in the subtitle copy**,
  so the page opens centred on someone the reader just read about.
- **The capture-phase outside-click listener in `DetailCard.tsx`** is what makes switching
  actors one click instead of two. Covered by the *"clicking a different node swaps the open
  card in one click"* test.
- **Roving tabindex: the `<svg>` is the only tab stop**, nodes are `tabIndex={-1}`. Giving
  nodes `tabIndex={0}` would put 350 stops in the tab order.
- **The page never scrolls horizontally at any breakpoint** — the chart scrolls inside
  `.tus-graph-scroll`, the document does not. Covered by an existing test across five widths.
- **`.tus-graph-scroll` uses `justify-content: safe center`, not bare `center`.** The `safe`
  keyword is what stops an overflowing chart from being centred half off-screen at a
  `scrollLeft` that can't reach it. See the existing spec's Phase 8 for the full diagnosis.

---

## Verification

Run the existing suite after every phase — it already covers layout fit, card containment,
deep links, history, and the one-click card swap:

```bash
npx playwright test tests/usual-suspects.spec.ts
```

Add new coverage to that same file rather than a new spec (project convention — the `tests/`
scaffold is shared across stories). New tests this plan calls for:

1. **Clickability** (Phase 1): ≥95% of in-view nodes own their own centre, two actors ×
   two viewports.
2. **Hover label** (Phase 2): appears on pointer move without a click; absent under touch
   emulation; doesn't intercept clicks.
3. **Search normalisation** (3c): `"samuel jackson"` → Samuel L. Jackson; `"Penelope Cruz"` →
   Penélope Cruz; `"tom"` ranks Tom Cruise/Tom Hanks above Marisa Tomei.

For anything visual, drive the real page and screenshot it rather than trusting the DOM —
the Phase 1 bug was invisible to every assertion in the suite until it was probed with
`elementFromPoint`, and the 3a stale-photo bug is invisible to the DOM entirely (the `src`
attribute is correct the whole time the wrong face is on screen).
