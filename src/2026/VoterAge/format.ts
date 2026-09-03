import type { SingleYearRow } from "./types";

export const fmtPct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
export const fmtPP = (v: number, digits = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}pp`;
export const fmtM = (thousands: number) => `${(thousands / 1000).toFixed(1)}M`;

/**
 * Finds the approximate single-year-of-age "representation crossover" -
 * the age at which a 3-year rolling average of (shareVote / shareElig)
 * first crosses 1.0 and stays there. Mirrors the smoothing method used
 * during planning (.claude/voter-age-spec.md S5) so the "around age 40"
 * claim is derived from the loaded data, not a hand-typed number that
 * could drift from a future data refresh.
 */
export function findCrossoverAge(rows: SingleYearRow[]): number | null {
  const singleYears = rows.filter((r) => r.age <= 79).sort((a, b) => a.age - b.age);
  const ratios = singleYears.map((r) => ({ age: r.age, ratio: r.shareVote / r.shareElig }));
  const smoothed = ratios.map((r, i) => {
    const window = ratios.slice(Math.max(0, i - 1), Math.min(ratios.length, i + 2));
    return { age: r.age, smoothed: window.reduce((s, w) => s + w.ratio, 0) / window.length };
  });
  for (let i = 1; i < smoothed.length; i++) {
    if (smoothed[i - 1].smoothed < 1.0 && smoothed[i].smoothed >= 1.0) {
      return smoothed[i].age;
    }
  }
  return null;
}
