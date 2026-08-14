import type { WealthGroup } from "./data";

export interface PersonDot {
  id: number;
  groupIndex: number;
  /** virtual grid coords (same unit space as the map grid) while staged */
  stagingX: number;
  stagingY: number;
}

/** Height of the staging strip, in the same virtual units as the map grid. */
export const STAGING_HEIGHT = 130;

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
    for (let k = 0; k < count; k++) {
      dots.push({ id: id++, groupIndex, stagingX: x, stagingY: STAGING_HEIGHT / 2 });
      x += dotSpacing;
    }
    x += groupGap;
  });
  return dots;
}

/**
 * For each already-placed group, picks a distinct random claimed cell per
 * dot (a simple scatter sample) — re-sampled fresh every call, so landed
 * dots resettle slightly whenever a later seed reshapes their region too.
 */
export function sampleLandedPositions(
  dots: PersonDot[],
  claimedBy: Int8Array,
  gridWidth: number,
  placedGroupCount: number
): Map<number, { x: number; y: number }> {
  const candidatesByGroup: number[][] = Array.from({ length: placedGroupCount }, () => []);
  for (let i = 0; i < claimedBy.length; i++) {
    const g = claimedBy[i];
    if (g >= 0 && g < placedGroupCount) candidatesByGroup[g].push(i);
  }

  const landed = new Map<number, { x: number; y: number }>();
  for (let gi = 0; gi < placedGroupCount; gi++) {
    const candidates = candidatesByGroup[gi];
    const groupDots = dots.filter((d) => d.groupIndex === gi);
    for (const dot of groupDots) {
      if (candidates.length === 0) break;
      const pick = Math.floor(Math.random() * candidates.length);
      const cell = candidates[pick];
      candidates[pick] = candidates[candidates.length - 1];
      candidates.pop();
      landed.set(dot.id, { x: cell % gridWidth, y: (cell / gridWidth) | 0 });
    }
  }
  return landed;
}
