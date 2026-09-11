import { forceCollide, forceSimulation, forceX, forceY } from "d3";
import type { SimulationNodeDatum } from "d3";
import type { Bucket } from "./graph";
import type { Movie } from "./types";

export interface PositionedActor {
  id: number;
  x: number;
  y: number;
  size: number;
  sharedMovies: Movie[];
}

export interface Column {
  sharedFilms: number;
  x: number;
  actors: PositionedActor[];
  /** Topmost y reached by this column's swarm - lets the caller size the SVG viewport. 0 for an empty column (nothing to draw above the baseline). */
  top: number;
  /** How far this column's own content reaches from its center x - lets the
   * caller size the SVG viewport (and space the next column) to the swarm's
   * real width instead of a guessed constant. Floored at cfg.labelHalfWidth
   * for a populated column so its two number labels have room, or at the
   * narrower BREAK_HALF_WIDTH for a break - see layoutBeeswarm. */
  halfWidth: number;
  /** Non-null for a collapsed run of shared-film counts nobody in this
   * bucket has - [highest, lowest] in render (descending) order, e.g.
   * [11, 8] for Adam Sandler's gap between his 12-film and 7-film costars.
   * The gap is real information, so it stays visible as an axis break
   * rather than being silently closed up; the caller draws it as a narrow
   * break marker, not a column. */
  missing: [number, number] | null;
}

/** Layout dimensions, picked from viewport width by the caller - a 220px column
 * that reads fine on a desktop makes the chart ~12x the screen width on a
 * 390px phone, so the whole geometry scales rather than just being scrolled. */
export interface LayoutConfig {
  /** Only feeds sizeForBucket's area budget now - it is NOT a pitch. Columns
   * are spaced by their own packed width (see layoutBeeswarm); this is just
   * "how wide a column is allowed to think it is" when deciding how big its
   * avatars can be. */
  columnWidth: number;
  targetColumnHeight: number;
  sideMargin: number;
  minNodeSize: number;
  maxNodeSize: number;
  /** Floor on a populated column's halfWidth - room for its two stacked
   * number labels (the bold costar count above the swarm, the shared-film
   * count in the header row). Both are bare numbers at every viewport now,
   * so this is small: a 3-digit count at 16px measures ~29px, half of that
   * plus air. It replaces the old `(columnWidth - COLUMN_GAP) / 2`, which
   * reserved 92px per column to fit the words "12 films together". */
  labelHalfWidth: number;
}

export const DESKTOP_LAYOUT: LayoutConfig = {
  columnWidth: 200,
  targetColumnHeight: 900,
  // 120 before, and now genuinely additive - App.tsx adds it beyond each end
  // column's own halfWidth rather than taking the larger of the two, so this
  // is real clear space at both ends rather than a floor the widest column
  // swallows. Not cut further than 64 despite bare-number labels needing
  // less edge room: this margin doubles as the dead zone that lets a click
  // past the end column dismiss an open card instead of resolving to the
  // nearest face. That needs to stay wider than MIN_MATCH_RADIUS (24 units)
  // plus however far in from the edge someone clicks, at the lowest render
  // scale the chart uses - 64 clears it with room to spare.
  sideMargin: 64,
  minNodeSize: 24,
  // 88 before. Ten of Adam Sandler's thirteen columns hold one or two people
  // each, and at 88 they cost 910 units - 48% of his whole chart - to show
  // 10 faces. 64 is still large and plainly recognizable, and because the
  // chart no longer renders at the 0.65 MIN_SCALE clamp (see .tus-root in
  // App.css), those faces come out *bigger* on screen than they were:
  // 88 x 0.65 = 57px before, 64 x 1.0 = 64px now.
  maxNodeSize: 64,
  labelHalfWidth: 20,
};

export const COMPACT_LAYOUT: LayoutConfig = {
  columnWidth: 128,
  targetColumnHeight: 560,
  sideMargin: 32,
  minNodeSize: 17,
  maxNodeSize: 56,
  labelHalfWidth: 16,
};

const PACKING_EFFICIENCY = 0.72; // real beeswarms aren't perfect hex-packing
// Minimum clear air between two columns' swarms, even when both are packed
// wide enough to otherwise butt up against each other.
const COLUMN_GAP = 16;
// How much width a break marker reserves - just its own glyph, nothing
// more. A whole run of missing counts collapses into one of these (see
// layoutBeeswarm), so this is paid once per gap rather than once per
// missing number.
const BREAK_HALF_WIDTH = 10;

/** Bigger buckets get smaller avatars, so a 227-person "1 shared film" column
 * stays navigable instead of running thousands of px tall - nobody's dropped,
 * everyone's still a real clickable node, they're just drawn smaller. A
 * singleton bucket (someone's single most-frequent collaborator) gets the
 * largest size instead, since being the only entry in that bucket is itself
 * the point. */
function sizeForBucket(count: number, cfg: LayoutConfig): number {
  const areaPerNode = (cfg.targetColumnHeight * cfg.columnWidth * PACKING_EFFICIENCY) / count;
  const diameter = 2 * Math.sqrt(areaPerNode / Math.PI);
  return Math.max(cfg.minNodeSize, Math.min(cfg.maxNodeSize, diameter));
}

interface SimNode extends SimulationNodeDatum {
  id: number;
  r: number;
}

interface PackedColumn {
  sharedFilms: number;
  actors: PositionedActor[];
  top: number;
  /** How far this column's swarm actually reached from its center x=0, the
   * larger of its left and right extents. 0 for an empty column - the
   * caller floors this to a minimum before using it for spacing. */
  halfWidth: number;
}

/** Packs one bucket into its own vertical swarm via d3-force, centered on
 * local x=0: mutual repulsion (collision) does the actual "beeswarm"
 * spreading, a weak pull back toward the center line keeps it a cohesive
 * cluster instead of drifting into a diffuse mess, and a strong pull toward
 * x=0 keeps it centered on its axis label. Each bucket gets its own isolated
 * simulation rather than sharing one global one across every column - see
 * layoutBeeswarm for why that used to let a wide swarm overlap its
 * neighbor. */
function packColumn(bucket: Bucket, size: number): PackedColumn {
  const nodes: SimNode[] = bucket.entries.map(({ actor }, j) => ({
    id: actor.id,
    r: size / 2,
    x: (j % 2 === 0 ? 1 : -1) * (j * 2), // slight seeded jitter so the sim doesn't start perfectly stacked
    y: (j % 7) * 6,
  }));

  const simulation = forceSimulation(nodes)
    .force("x", forceX<SimNode>(0).strength(0.85))
    .force("y", forceY<SimNode>(0).strength(0.06))
    .force("collide", forceCollide<SimNode>((d) => d.r + 1))
    .stop();

  for (let i = 0; i < 220; i++) simulation.tick();

  // Baseline-align: shift so this column's lowest point sits on y=0, growing upward (negative y).
  const maxY = Math.max(...nodes.map((n) => n.y! + n.r));
  const moviesById = new Map(bucket.entries.map((e) => [e.actor.id, e.sharedMovies]));
  const actors: PositionedActor[] = nodes.map((n) => ({
    id: n.id,
    x: n.x!,
    y: n.y! - maxY,
    size,
    sharedMovies: moviesById.get(n.id) ?? [],
  }));
  const top = Math.min(...actors.map((p) => p.y - p.size / 2));
  const halfWidth = Math.max(...nodes.map((n) => Math.abs(n.x!) + n.r));
  return { sharedFilms: bucket.sharedFilms, actors, top, halfWidth };
}

/**
 * Packs every bucket into its own vertical swarm via d3-force (see
 * packColumn) and lays the columns out left to right, spacing each pair by
 * however much room their actual swarms need rather than a fixed pitch - a
 * fixed pitch is what used to let a wide swarm (many large avatars, since
 * sizeForBucket grows avatars for smaller buckets) overlap and hide part of
 * its neighbor, since nothing kept two columns' independently-centered
 * swarms from spreading into the same x range.
 *
 * The axis is ORDINAL and DESCENDING: only counts this actor actually has
 * get a column, highest first (bucketCostars already sorts that way; the
 * re-sort below is so this function doesn't silently depend on it). A run of
 * counts nobody has collapses into a single narrow break marker rather than
 * one blank column per missing number.
 *
 * What that replaced: a linear 1..max axis with a blank column for every
 * unrepresented count. It was defensible - the gaps are real information -
 * but it priced them terribly. Adam Sandler has a costar at 26 films, so he
 * got 26 columns for 13 populated ones, 3,351 viewBox units wide, which
 * forced the whole chart down to the 0.65 MIN_SCALE floor and rendered his
 * biggest column's faces at 18 CSS px. Anupam Kher was worse: 18 blank
 * columns between his 1-4 films and his 6/13/14/18/20-film outliers.
 * Collapsing each *run* to one marker keeps the "there's a gap here" signal
 * and pays for it once instead of once per integer - and the numbers either
 * side of the marker still say exactly how wide the gap is.
 *
 * The other half of the width saving is the labels: they're bare numbers at
 * every viewport now (the units are spelled out once above the chart), so a
 * populated column's floor is cfg.labelHalfWidth (~20) instead of the 92 it
 * took to fit "12 films together". With that gone, the old `Math.max(
 * cfg.columnWidth, gap)` pitch floor goes too - it existed so two populated
 * swarms never crowded each other, but the halfWidth + COLUMN_GAP + halfWidth
 * spacing below already guarantees that geometrically.
 */
export function layoutBeeswarm(buckets: Bucket[], cfg: LayoutConfig): Column[] {
  // Descending, so the closest collaborators land on the left. Re-sorted
  // here rather than trusting the caller: bucketCostars guarantees this
  // order today, but the break-run detection below is silently wrong for
  // any other ordering, and that would show up as a visual oddity rather
  // than an error.
  const ordered = [...buckets].sort((a, b) => b.sharedFilms - a.sharedFilms);

  // Populated columns interleaved with one break marker per run of missing
  // counts. A break carries the run it stands for as [highest, lowest].
  const slots: (PackedColumn | { missing: [number, number] })[] = [];
  ordered.forEach((bucket, i) => {
    slots.push(packColumn(bucket, sizeForBucket(bucket.entries.length, cfg)));
    const next = ordered[i + 1];
    if (next && bucket.sharedFilms - next.sharedFilms > 1) {
      slots.push({ missing: [bucket.sharedFilms - 1, next.sharedFilms + 1] });
    }
  });

  const halfWidthFor = (slot: (typeof slots)[number]) =>
    "missing" in slot ? BREAK_HALF_WIDTH : Math.max(cfg.labelHalfWidth, slot.halfWidth);

  let x = 0;
  return slots.map((slot, i) => {
    const halfWidth = halfWidthFor(slot);
    if (i > 0) x += halfWidthFor(slots[i - 1]) + COLUMN_GAP + halfWidth;
    if ("missing" in slot) {
      // sharedFilms doubles as this column's React key upstream; the top of
      // the collapsed run can never collide with a populated column's own
      // count, since by construction nobody has it.
      return { sharedFilms: slot.missing[0], x, actors: [], top: 0, halfWidth, missing: slot.missing };
    }
    return { sharedFilms: slot.sharedFilms, x, actors: slot.actors, top: slot.top, halfWidth, missing: null };
  });
}
