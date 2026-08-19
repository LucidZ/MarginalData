import type { WealthGroup } from "./data";
import type { Range } from "./pathAssign";

export interface PersonDot {
  id: number;
  groupIndex: number;
  /**
   * Which of the group's N evenly-spaced slots (0..N-1) this dot occupies
   * once landed — see `centerOutSlots` for why this isn't just creation
   * order.
   */
  regionSlot: number;
  /** virtual grid coords (same unit space as the map grid) while staged */
  stagingX: number;
  stagingY: number;
}

/** Height of the staging strip, in the same virtual units as the map grid. */
export const STAGING_HEIGHT = 130;

/**
 * Assigns each of a group's N dots to one of N evenly-spaced slots, ordered
 * by distance from the middle slot rather than left-to-right. The point:
 * the *first* dot in any group always gets the center slot, so a group with
 * very few dots (in the extreme, the 1-dot millionaire band) reads as
 * roughly centered in its region instead of always landing on slot 0 —
 * which, since slot 0 is one end of the group's claimed range, would put it
 * right on the seam with a neighboring region. Larger groups still end up
 * filling every slot (it's just a reordering of the same N slots), so their
 * spread is unaffected.
 */
function centerOutSlots(count: number): number[] {
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, slot) => slot).sort(
    (a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b
  );
}

/**
 * One dot per 1% of global population, grouped by wealth band (in bottom-up
 * placement order) and laid out in a single staged row above the map. Each
 * group's dot count is `populationShare` rounded to the nearest integer —
 * for these four bands that happens to sum to exactly 100 (53+34+12+1).
 */
export function buildPersonDots(groups: WealthGroup[], gridWidth: number): PersonDot[] {
  const counts = groups.map((g) => Math.round(g.populationShare * 100));
  const totalDots = counts.reduce((a, b) => a + b, 0);
  const groupGap = 40;
  const totalGapWidth = groupGap * (groups.length - 1);
  const dotSpacing = (gridWidth - totalGapWidth) / totalDots;

  const dots: PersonDot[] = [];
  let x = dotSpacing / 2;
  let id = 0;
  counts.forEach((count, groupIndex) => {
    const slotOrder = centerOutSlots(count);
    for (let k = 0; k < count; k++) {
      dots.push({ id: id++, groupIndex, regionSlot: slotOrder[k], stagingX: x, stagingY: STAGING_HEIGHT / 2 });
      x += dotSpacing;
    }
    x += groupGap;
  });
  return dots;
}

/** Cheap deterministic 0..1 hash, used to jitter a dot's spot within its group's slice. */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Picks a deterministic *rank* (an index into the path-ordered `sortedCells`
 * array, same space as land `Range`s — not yet a pixel) for each of a
 * group's dots within that group's own [start, end) range — stratified by
 * the dot's fixed `regionSlot` plus a stable per-dot jitter (kept within
 * that slot's own share of the range, so it can't wander into a neighboring
 * slot), rather than randomly sampled from the whole region. Two calls with
 * the same range always return the same ranks, so a dot only moves when its
 * own group's range actually changes (e.g. a later seed pushes it), never as
 * a side effect of an unrelated region being added elsewhere.
 *
 * Returning a rank rather than a pixel lets the caller animate a dot by
 * interpolating rank (i.e. sliding it along the path, same as the land
 * itself grows) instead of tweening raw x/y — which would cut straight
 * across the ocean whenever a push moves a dot's cell far along the route.
 */
export function sampleRangeRanks(
  dots: PersonDot[],
  groupIndex: number,
  range: Range,
  totalLandCells: number
): Map<number, number> {
  const groupDots = dots.filter((d) => d.groupIndex === groupIndex);
  const start = Math.max(0, Math.round(Math.min(range.start, range.end)));
  const end = Math.min(totalLandCells, Math.round(Math.max(range.start, range.end)));
  const span = end - start;

  const ranks = new Map<number, number>();
  if (span <= 0) return ranks;

  // Each dot wobbles *around* its slot's own center, rather than roaming
  // the slot's full width — with a lone dot (count 1, the millionaire
  // band), "full width" is the *entire region*, so the naive version could
  // land it anywhere from one edge to the other, defeating the centering
  // centerOutSlots was supposed to guarantee. 0.8 keeps the wobble inside
  // the slot with a small margin, never touching a neighboring slot.
  const JITTER_AMPLITUDE = 0.8;
  for (const dot of groupDots) {
    const jitter = (hash01(dot.id) - 0.5) * JITTER_AMPLITUDE;
    const frac = (dot.regionSlot + 0.5 + jitter) / groupDots.length;
    ranks.set(dot.id, start + Math.min(span - 1, Math.floor(frac * span)));
  }
  return ranks;
}
