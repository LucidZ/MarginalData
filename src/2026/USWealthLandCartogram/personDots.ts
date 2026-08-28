import type { WealthGroup } from "./data";

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
