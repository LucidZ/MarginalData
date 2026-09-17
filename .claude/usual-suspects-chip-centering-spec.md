# The Usual Suspects — centred name-under-face chips

## Problem

On the sparse ("named") rows at the top of every chart, the faces sit visibly
left of the row label above them.

This is not a rounding error. `packNamedRow` in `src/2026/UsualSuspects/beeswarm.ts`
centres the *chip block* — avatar + `NAME_GAP` + `chipExtent`, where `chipExtent`
is the widest name **anywhere in the chart** — while `App.tsx:946` centres
`.tus-row-label` on `row.centerX`, the true midline. Two different centres on
the same row. The face ends up `(chipExtent − size)/2` to the left of the label,
roughly 65px in viewBox units (≈150px on screen once the SVG is scaled up).

The uniform `chipExtent` (introduced so the one-chip rows would form a column)
makes every named row wrong by the *same* amount, which is why it reads as
deliberate-but-broken rather than random.

## Fix

Move the name **below** the avatar and centre it there. The chip becomes
symmetric about the face, so "centre the block" and "centre the face" collapse
into one operation — a one-person row's face lands exactly on `centerX`, which
is exactly where its label is.

Everything the uniform-extent hack existed to approximate falls out for free,
and the whole `widestChipExtent` / `chipExtent` plumbing gets deleted.

Secondary wins, all consequences of the same change:

- Chip pitch stops being a flat 240px and becomes name-aware, so a 390px phone
  fits 2–3 chips per line instead of one.
- The `<g>`'s bounding-box centre becomes the avatar's own x, which retires the
  documented wart in `ActorNode.tsx:78-88` (bbox centre falling in dead space
  beside the face).
- Two-line name wrapping removes most of the `NAME_MAX_CHARS` truncation
  pressure that "Christopher McDonald" exposed.

**Do not** switch to "N films together with M costars" for the row label — it is
ambiguous (reads as "made together *with*", i.e. all three of them). See §3.

---

## 1. `beeswarm.ts` — geometry

### Constants

Delete `CHIP_WIDTH`, `CHIP_HEIGHT`, `NAME_GAP`, `NAME_MAX_CHARS`, `fitName`,
and `widestChipExtent` entirely. Replace with:

```ts
/** Clear space kept between two adjacent chips on the same line. Also the
 * margin that keeps one chip's hit rect out of its neighbour's. */
const CHIP_GAP = 28;
/** Avatar bottom edge to the top of the first name line. */
const NAME_TOP_GAP = 8;
const NAME_LINE_HEIGHT = 15;
const NAME_MAX_LINES = 2;
/** Target width a wrapped name tries to stay inside, before the per-line
 * character backstop applies. */
const NAME_MAX_WIDTH = 150;
/** Hard per-line cap, with an ellipsis past it — the same "SVG text has no
 * text-overflow, and measuring every name would force a synchronous layout
 * per node" reasoning as the old NAME_MAX_CHARS, now applied per line. */
const NAME_MAX_CHARS_PER_LINE = 18;
/** Vertical gap between two wrapped lines of chips within one row. */
const CHIP_LINE_GAP = 12;
/** Air below a named row's last name line, so it doesn't crowd the next
 * row's label. rowGap alone (14 desktop / 10 compact) is not enough now that
 * a row ends in text rather than in a face. */
const NAMED_ROW_BOTTOM_PAD = 10;
```

`estimatedTextWidth` stays as-is — it is now used for wrapping and chip sizing
rather than for centring.

### `wrapName(name: string): string[]`

Replaces `fitName`.

1. Split on whitespace.
2. Greedily pack words into lines whose `estimatedTextWidth` stays under
   `NAME_MAX_WIDTH`. A single word longer than that gets its own line.
3. Truncate to `NAME_MAX_LINES`. If truncation dropped anything, append `…` to
   the last kept line.
4. Apply `NAME_MAX_CHARS_PER_LINE` per line as a backstop, `…` past it.

### `packNamedRow` — rewrite

Signature drops `chipExtent`:

```ts
function packNamedRow(
  bucket: Bucket,
  size: number,
  width: number,
  nameOf: (id: number) => string,
): { actors: PositionedActor[]; height: number }
```

Per chip:

```
lines_i     = wrapName(nameOf(id))
textWidth_i = max(estimatedTextWidth(line) for line in lines_i)
chipWidth_i = max(size, textWidth_i)
```

Greedy line-fill (widths now vary, so there is no fixed `perLine`): add chips to
the current line while `sum(chipWidth) + (n − 1) * CHIP_GAP <= width`; always
place at least one chip per line.

Per line, centre on the line's **real** extent:

```
lineWidth = sum(chipWidth_i) + (count − 1) * CHIP_GAP
originX   = max(0, (width − lineWidth) / 2)
cursor    = originX
for each chip:
  x = cursor + chipWidth_i / 2
  cursor += chipWidth_i + CHIP_GAP
```

Per-line real extent is correct now, and the reason the old code couldn't use it
no longer applies: with the name centred under the face, a one-chip row's face
is at `width/2` regardless of how long the name is, so the faces no longer
wander with name length. Odd-count rows put a face exactly on the midline;
even-count rows straddle it symmetrically. That is the right behaviour for
centred content.

Vertical, using the row's own maximum line count so chips on a line share a
baseline:

```
maxLines   = max(lines_i.length) across the whole row
chipHeight = size + NAME_TOP_GAP + maxLines * NAME_LINE_HEIGHT
linePitch  = chipHeight + CHIP_LINE_GAP
y_i        = lineIndex * linePitch + size / 2
height     = (lineCount − 1) * linePitch + chipHeight + NAMED_ROW_BOTTOM_PAD
```

Per-actor output:

```ts
{
  id, x, y, size, sharedMovies,
  nameLines: lines_i,
  hitWidth:  chipWidth_i,
  hitHeight: size + NAME_TOP_GAP + lines_i.length * NAME_LINE_HEIGHT,
}
```

`hitWidth` is the chip's own width, **centred on the face** (see §2). The
guarantee the whole hit-testing design rests on — no node's target may reach
into a neighbour's — still holds and is now easier to see: adjacent faces are
`chipWidth_i/2 + CHIP_GAP + chipWidth_{i+1}/2` apart, so each rect stops
`CHIP_GAP` short of the next chip's edge.

### `PositionedActor`

Replace `name?: string` with `nameLines?: string[]`, and add `hitHeight?: number`
alongside `hitWidth`. Update the doc comments: `hitWidth` is now a *centred*
width, not a left-anchored one.

### `layoutRows`

Delete the `chipExtent` computation and the `widestChipExtent` call; drop the
argument from the `packNamedRow` call. Everything else (the `ROW_LABEL_BAND`
offset, break rows, `centerX`) is unchanged.

---

## 2. `ActorNode.tsx`

Props: `label?: string` → `nameLines?: string[]`; add `hitHeight?: number`.

**Hit rect** — now centred horizontally and covering the name block:

```tsx
{nameLines && hitWidth != null && hitHeight != null && (
  <rect
    x={-hitWidth / 2}
    y={-r}
    width={hitWidth}
    height={hitHeight}
    fill="transparent"
    pointerEvents="all"
  />
)}
```

Keep it rendered **before** the avatar circle, so the avatar still wins at its
own centre — that ordering is load-bearing, don't reorder it.

**Name** — replaces the single right-anchored `<text>`:

```tsx
{nameLines?.map((line, i) => (
  <text
    key={i}
    className="tus-node-label"
    x={0}
    y={r + NAME_TOP_GAP + i * NAME_LINE_HEIGHT}
    textAnchor="middle"
    dominantBaseline="hanging"
    pointerEvents="none"
  >
    {line}
  </text>
))}
```

`NAME_TOP_GAP` and `NAME_LINE_HEIGHT` must agree with `beeswarm.ts` — export
them from `beeswarm.ts` and import here rather than duplicating the numbers.

Update the `label` and `hitWidth` prop doc comments to match the new geometry,
and update the hit-rect comment: the "bounding-box centre falls in the gap
beside the face" wart is now fixed by construction rather than by extending the
rect sideways.

---

## 3. Row label copy

Current: `23 films together · 2`, with a legend line under the intro explaining
what the trailing number means. Needing a sentence to explain a number is the
tell that the number isn't carrying itself.

**Two changes in `App.tsx:944-950`:**

1. Label the count: `· {n} costar{s}` instead of a bare `· {n}`. Handle the
   singular.
2. **Omit the count entirely on named rows** (`row.named === true`). On a one-
   or two-person row you can count the faces; the number is noise exactly where
   the chart is cleanest and arrives above the fold. Keep it on packed rows,
   where counting 491 faces is impossible.

The rule reads naturally — the number appears when you can't count — and the
two row types are already visibly different treatments, so the asymmetry won't
scan as sloppy.

```tsx
<text className="tus-row-label" x={row.centerX} y={row.y + 14} textAnchor="middle">
  {filmLabel(row.sharedFilms, compact)}
  {!row.named && (
    <tspan className="tus-row-count">
      {` · ${row.actors.length} costar${row.actors.length === 1 ? "" : "s"}`}
    </tspan>
  )}
</text>
```

**Legend line** (`.tus-axis-unit-note`, `App.tsx:865-870`): the count now
describes itself, so drop the explanatory half and keep only the ordering cue:

> Closest collaborators first — the people who share the most films with
> {root.name} are at the top.

Update the surrounding comment block, which currently explains why the label was
compressed to a bare number.

---

## 4. `App.css`

The vertical rhythm is now `label → faces → names → label → faces → names`, and
`.tus-row-label` (13px secondary) vs `.tus-node-label` (13px primary/500) is too
thin a distinction for two things that alternate down the page. Widen it:

```css
.tus-row-label {
  font-size: 11px;
  letter-spacing: 0.04em;
  fill: var(--text-secondary);
}

.tus-node-label {
  font-size: 13px;
  fill: var(--text-primary);
  font-weight: 600;
}
```

`.tus-row-count` is unchanged. Update the `.tus-node-label` comment — it is no
longer "beside a face".

---

## 5. `App.tsx` — mechanical follow-ons

- `FlatNode.name?: string` → `nameLines?: string[]`; `buildFlatNodes` copies
  `p.nameLines`.
- Hover-suppression gate at `App.tsx:713`:
  `hoveredCandidate?.name ? null : …` → `hoveredCandidate?.nameLines ? null : …`.
  The intent is unchanged — don't paint a hover readout over a name that is
  already on screen.
- `ActorNode` call site: `label={p.name}` → `nameLines={p.nameLines}`, plus
  `hitHeight={p.hitHeight}`.
- `resolveNearestNode`'s `MIN_MATCH_RADIUS` needs no change. A click on a name
  is ~50px below the face centre, outside the match radius, but the chip's own
  hit rect catches it first — nodes paint after the background overlay.

---

## 6. Tests — `tests/usual-suspects.spec.ts`

**Add one new test**, which is the direct regression guard for the bug:

```
"named-row faces are centred on their row label"
```

For DESKTOP and MOBILE, on the default chart and on Adam Sandler
(`nm0001191` — he has a 26-film one-person row and a 23-film two-person row):
for every row that renders chips, compare the row label's own centre x against
the centre of its faces' centres. Assert within 2px.

Resolve labels and faces per row rather than globally — each row is its own
`<g>`, so read `.tus-row-label` and the sibling `.tus-node` hit circles inside
the same parent. Use the first `<circle>` for a node's centre, **not** its bbox
— the existing `nodeCenters` helper documents why, and it still applies (the
name now extends *below* the face rather than to the right of it, so the bbox
centre is still not the avatar).

**Expect to still pass unchanged**, but verify rather than assume:

- `in-view nodes are clickable at their own center` (×4) — samples the dense
  rows, untouched by this change.
- `denseRowNode` — still keys off absence of `.tus-node-label`.
- `the closest-collaborator row is above the fold on load` — named rows get
  ~40px taller each; confirm the first row and its label still clear the fold
  at 390×800. If it no longer does, reduce `NAME_MAX_LINES` to 1 on compact
  before touching anything else.
- `the chart never exceeds its own frame's width`, `page never scrolls
  horizontally` — greedy line-fill must never emit a line wider than `width`;
  a single chip whose name exceeds `width` is the edge case, hence the
  `max(0, …)` on `originX`.
- `gap runs collapse to one break marker each` — asserts chart height < 2000px
  for Anupam Kher. He has several sparse rows that each grow; re-check the
  margin.

Refresh the two committed screenshots (`usual-suspects-top-{1440,390}.png`)
that this suite writes.

Run: `npm run test:visual -- usual-suspects` (dev server per
`playwright.config`). Also run `npm run lint`.

---

## 7. Out of scope

- No change to `packRow`, `sizeForRow`, the force simulation, or anything about
  the dense rows.
- No change to `NAMED_ROW_MAX` (8). The chip/blob threshold is a separate
  question; re-tuning it now would confound this change's before/after.
- No change to the detail card, search, info panel, or the recenter FLIP.
