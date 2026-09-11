import { forceCollide, forceSimulation, forceX, forceY } from "d3";
import type { SimulationNodeDatum } from "d3";
import type { Bucket } from "./graph";
import type { Movie } from "./types";

export interface PositionedActor {
  id: number;
  /** Center, relative to its own row's origin (left edge of the face area, top of the row). */
  x: number;
  y: number;
  size: number;
  sharedMovies: Movie[];
  /** Set only on a named row (see NAMED_ROW_MAX) - the sparse top rows have
   * horizontal room to spare, so the people who actually carry the story get
   * their names on screen without a hover or a click. */
  name?: string;
  /** Width of this node's clickable area, for named rows only: the face and
   * its name read as one unit, so they have to behave as one. Bounded to the
   * chip's own cell minus a gap, which keeps the guarantee every hit target
   * here depends on - that a node's hit area can never reach into a
   * neighbour's (see ActorNode.tsx). */
  hitWidth?: number;
}

export interface Row {
  /** Shared-film count this row represents. For a break row, the highest
   * count inside the collapsed run - unique by construction (nobody has it),
   * so it doubles as a stable React key. */
  sharedFilms: number;
  /** Top of this row within the chart, growing downward from 0. */
  y: number;
  height: number;
  actors: PositionedActor[];
  /** Non-null for a collapsed run of shared-film counts nobody has -
   * [highest, lowest]. Drawn as a narrow axis break, not a row of faces. */
  missing: [number, number] | null;
  /** True when this row's actors carry `name` and are laid out as labelled
   * chips rather than packed into a blob. */
  named: boolean;
}

/**
 * Layout dimensions. `contentWidth` is measured from the DOM rather than
 * guessed, because the whole point of the vertical arrangement is that the
 * faces fill whatever width the viewport actually has - there is no
 * horizontal scroll to escape into any more.
 */
export interface RowLayoutConfig {
  /** Width available to faces, after the label gutter is subtracted. */
  contentWidth: number;
  minNodeSize: number;
  maxNodeSize: number;
  /** Clear air below each row. */
  rowGap: number;
  /** Height a break row reserves for its own glyph. */
  breakHeight: number;
}

export const DESKTOP_ROWS = {
  minNodeSize: 26,
  maxNodeSize: 64,
  rowGap: 14,
  breakHeight: 26,
} as const;

export const COMPACT_ROWS = {
  minNodeSize: 22,
  maxNodeSize: 56,
  rowGap: 10,
  breakHeight: 22,
} as const;

/** A row holding at most this many people is laid out as labelled chips -
 * face plus name - instead of a packed blob. Chosen from what the data
 * actually looks like rather than picked round: a third of a typical actor's
 * rows hold just one or two people (median across the pool), and 84% of
 * actors' rows widen monotonically from the top, so the sparse end is
 * reliably the top of the chart - the part that arrives above the fold and
 * the part whose names someone would recognize. */
const NAMED_ROW_MAX = 8;

/** Width a named chip reserves: avatar, gap, and room for a name. Wraps to
 * another line when the viewport can't fit them side by side, which on a
 * 390px phone means one per line - still the right call there, since a
 * 2-person row is then 2 lines and the names are the whole point of it.
 *
 * 240 rather than a tighter 210: at 210 the text column is 136px, which fits
 * about 17 characters at the label's own size, and real names overrun that
 * routinely enough to matter - "Christopher McDonald" (20) painted straight
 * through Carl Weathers' face in the row below it. 240 leaves 166px, about
 * 21 characters, which covers the overwhelming majority; NAME_MAX_CHARS
 * below is the backstop for the rest. */
const CHIP_WIDTH = 240;
const CHIP_HEIGHT = 64;
/** Clear space kept at the right of each chip's hit area - see hitWidth. */
const CHIP_GAP = 24;

/** Hard cap on a rendered name, with an ellipsis past it. SVG text has no
 * equivalent of text-overflow, and measuring every name with
 * getComputedTextLength would force a synchronous layout per node during
 * packing, so this is a character budget derived from CHIP_WIDTH's text
 * column at the label's font size rather than a real measurement. Erring
 * long: a name that slightly overruns its chip is far less bad than one
 * truncated when it didn't need to be. */
const NAME_MAX_CHARS = 22;

function fitName(name: string): string {
  return name.length <= NAME_MAX_CHARS ? name : `${name.slice(0, NAME_MAX_CHARS - 1).trimEnd()}…`;
}

/** Beeswarms don't hex-pack perfectly; this is the share of a row's box the
 * faces really occupy once collision has settled them. Used to turn a head
 * count into a block height. */
const PACKING_EFFICIENCY = 0.74;

interface SimNode extends SimulationNodeDatum {
  id: number;
  r: number;
  /** Grid slot this node was seeded at - also the anchor the positioning
   * forces pull it back toward, which is what keeps the blob inside its box
   * instead of drifting out of the row. */
  seedX: number;
  seedY: number;
}

/**
 * Picks an avatar diameter for a row of `count` people that keeps the row's
 * own block a sensible height for the width it has.
 *
 * The column version of this sized avatars against a fixed target column
 * height, which is what used to drive Adam Sandler's chart to the MIN_SCALE
 * floor: once a big bucket's computed diameter hit minNodeSize, the column
 * stopped responding to that target at all and simply overflowed. Rows have
 * no such target - a row is as tall as it needs to be and the page scrolls -
 * so this only has to keep the biggest rows from becoming absurd, which
 * means a gentler curve and no uniform down-scaling of the whole chart.
 */
function sizeForRow(count: number, cfg: RowLayoutConfig): number {
  if (count <= NAMED_ROW_MAX) return cfg.maxNodeSize;
  // Aim each blob at roughly a 4:1 width:height block, so even Samuel L.
  // Jackson's 491-person row stays a readable band rather than a full page
  // of faces - then let the min/max clamp have the final say.
  const targetHeight = cfg.contentWidth / 4;
  const areaPerNode = (cfg.contentWidth * targetHeight * PACKING_EFFICIENCY) / count;
  const diameter = 2 * Math.sqrt(areaPerNode / Math.PI);
  return Math.max(cfg.minNodeSize, Math.min(cfg.maxNodeSize, diameter));
}

/**
 * Packs one row's people into a horizontal blob of the given width via
 * d3-force. Seeds them on a jittered hex-ish grid covering the box, then
 * lets collision push them apart while weak positional forces pull each node
 * back toward its own seed. That pairing is what keeps the result organic -
 * nobody lands on a visible lattice - while still bounded by the row's box.
 * A single centering force can't do the job here the way it did for columns:
 * the box is wide and short, so one pull toward its center would pile
 * everyone into the middle and leave both ends bare.
 */
function packRow(bucket: Bucket, size: number, width: number): { actors: PositionedActor[]; height: number } {
  const count = bucket.entries.length;
  const r = size / 2;
  // Slightly tighter than the nominal diameter - beeswarm packing beats a
  // square lattice, and collision below settles the difference.
  const pitch = size * 0.94;
  const perLine = Math.max(1, Math.floor(width / pitch));
  const lines = Math.ceil(count / perLine);
  // Rows of circles nest, so each line after the first costs less than a
  // full diameter.
  const linePitch = size * 0.9;

  const nodes: SimNode[] = bucket.entries.map(({ actor }, i) => {
    const line = Math.floor(i / perLine);
    const col = i % perLine;
    // Half-pitch offset on alternate lines makes the seed grid hex-like
    // before collision even runs; the small deterministic jitter keeps the
    // settled result from reading as a grid.
    const seedX = r + col * pitch + (line % 2 ? pitch / 2 : 0) + ((i * 37) % 7) - 3;
    const seedY = r + line * linePitch + ((i * 53) % 5) - 2;
    return { id: actor.id, r, seedX, seedY, x: seedX, y: seedY };
  });

  const simulation = forceSimulation(nodes)
    .force("x", forceX<SimNode>((d) => d.seedX).strength(0.35))
    .force("y", forceY<SimNode>((d) => d.seedY).strength(0.45))
    .force("collide", forceCollide<SimNode>((d) => d.r + 1))
    .stop();

  // Clamp inside the tick loop, not after it. Clamping once at the end looks
  // equivalent and isn't: forceCollide guarantees every pair of centers stays
  // at least 2r+2 apart, which is the whole reason a node can own its own
  // center for hit-testing (see resolveNearestNode in App.tsx and
  // ActorNode.tsx's hit circle). A post-hoc clamp breaks that guarantee
  // silently - two nodes pushed to the same edge x end up overlapping, and
  // whichever paints second covers the other's center. Measured at 71/80 and
  // 55/69 in-view nodes owning their own center, against the 95% floor the
  // suite enforces. Clamping each tick instead lets collision see the
  // clamped positions and resolve them in y on the following pass.
  for (let i = 0; i < 90; i++) {
    simulation.tick();
    for (const n of nodes) {
      n.x = Math.min(Math.max(n.x!, r), width - r);
      n.y = Math.max(n.y!, r);
    }
  }

  const moviesById = new Map(bucket.entries.map((e) => [e.actor.id, e.sharedMovies]));
  const actors: PositionedActor[] = nodes.map((n) => ({
    id: n.id,
    x: n.x!,
    y: n.y!,
    size,
    sharedMovies: moviesById.get(n.id) ?? [],
  }));

  const nominalHeight = (lines - 1) * linePitch + size;
  return { actors, height: Math.max(nominalHeight, ...actors.map((a) => a.y + a.size / 2)) };
}

/** Lays a sparse row out as labelled chips - face then name - wrapping when
 * the width runs out. No simulation: with eight or fewer people there is
 * nothing to pack around, and a predictable left-to-right reading order is
 * worth more here than organic placement. */
function packNamedRow(
  bucket: Bucket,
  size: number,
  width: number,
  nameOf: (id: number) => string,
): { actors: PositionedActor[]; height: number } {
  const perLine = Math.max(1, Math.floor(width / CHIP_WIDTH));
  const actors: PositionedActor[] = bucket.entries.map(({ actor, sharedMovies }, i) => ({
    id: actor.id,
    x: (i % perLine) * CHIP_WIDTH + size / 2,
    y: Math.floor(i / perLine) * CHIP_HEIGHT + size / 2,
    size,
    sharedMovies,
    name: fitName(nameOf(actor.id)),
    // The cell minus a gap, so the next chip's own face is never inside this
    // one's hit area. Chips are CHIP_WIDTH apart and the face is centred at
    // size/2 from the cell's left edge, so leaving CHIP_GAP clear at the
    // right keeps the two comfortably separate.
    hitWidth: CHIP_WIDTH - CHIP_GAP,
  }));
  const lines = Math.ceil(bucket.entries.length / perLine);
  return { actors, height: (lines - 1) * CHIP_HEIGHT + size };
}

/**
 * Stacks every bucket into its own full-width row, closest collaborators at
 * the top, with a break row standing in for each run of shared-film counts
 * nobody has.
 *
 * This replaced a horizontal arrangement - one vertical beeswarm column per
 * count, laid out left to right - and the reason is scroll direction. Even
 * after the ordinal axis and bare-number labels had cut it down, that
 * version still put 155px of Adam Sandler's chart past the right edge on a
 * 1440px desktop and 945px past it on a 390px phone, behind a horizontal
 * scrollbar most people never touch, and it needed a second rotated layout
 * for mobile on top of that. Rows scroll vertically, which is free on every
 * device: nothing is hidden at any viewport, and there is one layout instead
 * of two. Modelled against the real pool before the rewrite, the tallest
 * chart in the sample is Samuel L. Jackson's at ~1250px on desktop and
 * ~2700px on a phone - three screenfuls of ordinary scrolling.
 *
 * Two things fall out of the rotation that were unreachable before. The
 * sparse rows have horizontal room to spare, so the people worth recognizing
 * get their names rendered beside their faces (packNamedRow) instead of
 * needing a hover. And the row labels can be words again - "26 films
 * together" in a left gutter costs no vertical space at all, whereas the
 * column version had to cut that same label to a bare number because its
 * 108px width forced a 184px minimum footprint on every column.
 *
 * Buckets arrive descending from bucketCostars; re-sorted here anyway so the
 * break-run detection can't be silently wrong under another ordering.
 */
export function layoutRows(
  buckets: Bucket[],
  cfg: RowLayoutConfig,
  nameOf: (id: number) => string,
): { rows: Row[]; height: number } {
  const ordered = [...buckets].sort((a, b) => b.sharedFilms - a.sharedFilms);
  const rows: Row[] = [];
  let y = 0;

  ordered.forEach((bucket, i) => {
    const named = bucket.entries.length <= NAMED_ROW_MAX;
    const size = sizeForRow(bucket.entries.length, cfg);
    const packed = named
      ? packNamedRow(bucket, size, cfg.contentWidth, nameOf)
      : packRow(bucket, size, cfg.contentWidth);
    rows.push({
      sharedFilms: bucket.sharedFilms,
      y,
      height: packed.height,
      actors: packed.actors,
      missing: null,
      named,
    });
    y += packed.height + cfg.rowGap;

    const next = ordered[i + 1];
    if (next && bucket.sharedFilms - next.sharedFilms > 1) {
      rows.push({
        sharedFilms: bucket.sharedFilms - 1,
        y,
        height: cfg.breakHeight,
        actors: [],
        missing: [bucket.sharedFilms - 1, next.sharedFilms + 1],
        named: false,
      });
      y += cfg.breakHeight + cfg.rowGap;
    }
  });

  return { rows, height: Math.max(0, y - cfg.rowGap) };
}
