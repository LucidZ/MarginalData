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

/**
 * Packs every bucket into its own vertical swarm via d3-force: each node is
 * strongly pulled toward its column's x, a collision force keeps same-size
 * circles from overlapping, and the mutual repulsion does the actual
 * "beeswarm" spreading - no node is dropped or curated out to make it fit,
 * dense buckets just render smaller (see sizeForBucket).
 *
 * Columns run 1..(this actor's own highest shared-film count) at a fixed x
 * per count, so a given count always sits at the same offset from the left
 * edge and stays comparable between actors. Interior gaps are preserved as
 * real blank columns (Anupam Kher shares 4 films with someone and 6 with
 * someone else, so "5 films" renders empty - that gap is information).
 * Only the empty tail past an actor's maximum is trimmed: rendering all the
 * way to the dataset-wide max of 20 made every chart 4,692px wide, ~75% of
 * it dead scroll for anyone who isn't Anupam Kher.
 */
export function layoutBeeswarm(buckets: Bucket[], cfg: LayoutConfig): Column[] {
  interface SimNode extends SimulationNodeDatum {
    id: number;
    columnX: number;
    r: number;
  }

  const actorMax = buckets.reduce((max, b) => Math.max(max, b.sharedFilms), 0);
  const bucketByWeight = new Map(buckets.map((b) => [b.sharedFilms, b]));

  const nodes: SimNode[] = [];
  const columnMeta = Array.from({ length: actorMax }, (_, i) => {
    const sharedFilms = i + 1;
    const bucket = bucketByWeight.get(sharedFilms);
    const size = bucket ? sizeForBucket(bucket.entries.length, cfg) : 0;
    return { sharedFilms, x: i * cfg.columnWidth, size, bucket };
  });

  columnMeta.forEach(({ x, size, bucket }) => {
    if (!bucket) return;
    bucket.entries.forEach(({ actor }, j) => {
      nodes.push({
        id: actor.id,
        columnX: x,
        r: size / 2,
        x: x + (j % 2 === 0 ? 1 : -1) * (j * 2), // slight seeded jitter so the sim doesn't start perfectly stacked
        y: (j % 7) * 6,
      });
    });
  });

  const simulation = forceSimulation(nodes)
    .force("x", forceX<SimNode>((d) => d.columnX).strength(0.85))
    // Weak pull back toward the swarm's center line - without this, collision
    // alone just pushes nodes apart with nothing bringing them back together,
    // and the swarm drifts into a diffuse mess with random gaps instead of a
    // cohesive cluster.
    .force("y", forceY<SimNode>(0).strength(0.06))
    .force("collide", forceCollide<SimNode>((d) => d.r + 1))
    .stop();

  for (let i = 0; i < 220; i++) simulation.tick();

  return columnMeta.map(({ sharedFilms, x, size, bucket }) => {
    if (!bucket) return { sharedFilms, x, actors: [], top: 0 };
    const moviesById = new Map(bucket.entries.map((e) => [e.actor.id, e.sharedMovies]));
    const ids = new Set(bucket.entries.map((e) => e.actor.id));
    const colNodes = nodes.filter((n) => ids.has(n.id));
    // Baseline-align: shift so this column's lowest point sits on y=0, growing upward (negative y).
    const maxY = Math.max(...colNodes.map((n) => n.y! + n.r));
    const positioned: PositionedActor[] = colNodes.map((n) => ({
      id: n.id,
      x: n.x! - x, // relative to column center
      y: n.y! - maxY,
      size,
      sharedMovies: moviesById.get(n.id) ?? [],
    }));
    const top = Math.min(...positioned.map((p) => p.y - p.size / 2));
    return { sharedFilms, x, actors: positioned, top };
  });
}
