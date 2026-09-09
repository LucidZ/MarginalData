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
   * real width instead of a guessed constant. Floored at half the configured
   * column pitch for a non-empty column so its axis label has room to
   * breathe, or at the much narrower EMPTY_COLUMN_HALF_WIDTH for an empty
   * one - see layoutBeeswarm for why those get a different floor. */
  halfWidth: number;
  /** True for an interior gap - a shared-film count nobody in this bucket
   * actually has. Real information (see layoutBeeswarm), so it's kept as a
   * real column rather than skipped, but the caller renders it narrower and
   * with just a bare number - see App.tsx. */
  isEmpty: boolean;
}

/** Layout dimensions, picked from viewport width by the caller - a 220px column
 * that reads fine on a desktop makes the chart ~12x the screen width on a
 * 390px phone, so the whole geometry scales rather than just being scrolled. */
export interface LayoutConfig {
  columnWidth: number;
  targetColumnHeight: number;
  sideMargin: number;
  minNodeSize: number;
  maxNodeSize: number;
}

export const DESKTOP_LAYOUT: LayoutConfig = {
  columnWidth: 200,
  targetColumnHeight: 900,
  sideMargin: 120,
  minNodeSize: 24,
  maxNodeSize: 88,
};

export const COMPACT_LAYOUT: LayoutConfig = {
  columnWidth: 128,
  targetColumnHeight: 560,
  sideMargin: 56,
  minNodeSize: 17,
  maxNodeSize: 62,
};

const PACKING_EFFICIENCY = 0.72; // real beeswarms aren't perfect hex-packing
// Minimum clear air between two columns' swarms, even when both are packed
// wide enough to otherwise butt up against each other.
const COLUMN_GAP = 16;
// How much width an empty (gap) column reserves - just enough for its own
// bare-number label, not a full column's worth of spacing. See
// layoutBeeswarm for why a run of gaps would otherwise still cost a full
// columnWidth each.
const EMPTY_COLUMN_HALF_WIDTH = 18;

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
 * Columns run 1..(this actor's own highest shared-film count) in order, so a
 * given count is always to the right of a smaller one and stays comparable
 * between actors. Interior gaps are preserved as real blank columns (Anupam
 * Kher shares 4 films with someone and 6 with someone else, so "5 films"
 * renders empty - that gap is information). Only the empty tail past an
 * actor's maximum is trimmed: rendering all the way to the dataset-wide max
 * of 20 made every chart 4,692px wide, ~75% of it dead scroll for anyone
 * who isn't Anupam Kher.
 *
 * An interior gap still reserves real width (EMPTY_COLUMN_HALF_WIDTH), just
 * much less than a populated column's minHalfWidth - Anupam Kher has 18 of
 * them between his 1-4 films and his 6/13/14/18/20-film outliers, and at the
 * full columnWidth pitch each one costs as much as a real column, which is
 * what made his chart 4,692px wide even after the dataset-wide-max trim
 * above. The columnWidth *pitch floor* (a full column's worth of spacing
 * even when both swarms are individually narrower) only applies between two
 * non-empty columns, too - it exists so two populated swarms never crowd
 * each other, which isn't a concern when one side is a bare number.
 */
export function layoutBeeswarm(buckets: Bucket[], cfg: LayoutConfig): Column[] {
  const actorMax = buckets.reduce((max, b) => Math.max(max, b.sharedFilms), 0);
  const bucketByWeight = new Map(buckets.map((b) => [b.sharedFilms, b]));
  // Half the old fixed pitch - what a populated column reserves for its
  // axis label even when its swarm itself is narrower.
  const minHalfWidth = (cfg.columnWidth - COLUMN_GAP) / 2;

  const packed: PackedColumn[] = Array.from({ length: actorMax }, (_, i) => {
    const sharedFilms = i + 1;
    const bucket = bucketByWeight.get(sharedFilms);
    if (!bucket) return { sharedFilms, actors: [], top: 0, halfWidth: 0 };
    return packColumn(bucket, sizeForBucket(bucket.entries.length, cfg));
  });

  const halfWidthFor = (col: PackedColumn) =>
    col.actors.length === 0 ? EMPTY_COLUMN_HALF_WIDTH : Math.max(minHalfWidth, col.halfWidth);

  let x = 0;
  return packed.map((col, i) => {
    const isEmpty = col.actors.length === 0;
    const halfWidth = halfWidthFor(col);
    if (i > 0) {
      const prev = packed[i - 1];
      const gap = halfWidthFor(prev) + COLUMN_GAP + halfWidth;
      x += isEmpty || prev.actors.length === 0 ? gap : Math.max(cfg.columnWidth, gap);
    }
    return { sharedFilms: col.sharedFilms, x, actors: col.actors, top: col.top, halfWidth, isEmpty };
  });
}
