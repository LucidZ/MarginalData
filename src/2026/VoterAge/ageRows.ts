import type { PopulationBarRow } from "./PopulationBars";
import type { AgeCycle, AgeRow } from "./types";

/** Years between consecutive November elections - how far a cohort slides
 * along the age axis per hop. */
export const HOP_YEARS = 2;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** One age row as a PopulationBars row, keyed `age-N`. */
export function toBarRow(row: AgeRow): PopulationBarRow {
  return {
    key: `age-${row.age}`,
    x: row.age,
    label: row.age === 100 ? "100+" : String(row.age),
    cvap: row.cvap,
    votes: row.votes,
    expected: row.expected, // this cycle's own 65+ rate x cvap
    missing: row.missing,
    turnout: row.turnout,
    ratesPooled: row.ratesPooled,
    registered: row.registered,
    expectedRegistered: row.expectedRegistered,
  };
}

/** A bar's identity is its birth cohort, so the same people keep the same
 * d3 element across every hop: age 40 in 2024 and age 38 in 2022 are both
 * `c-1984`. (The 100+ row is an open bucket; it takes its youngest member's
 * birth year, the same approximation beat 2's slide has always made.) */
export const cohortKey = (year: number, age: number) => `c-${year - age}`;

/** A year's rows at rest: each bar in its own age slot, keyed by cohort. */
export function cohortRows(cycle: AgeCycle, year: number): PopulationBarRow[] {
  return cycle.rows.map((r) => ({ ...toBarRow(r), key: cohortKey(year, r.age) }));
}

/**
 * One hop between neighbouring elections, `from` (later) -> `to` (two years
 * earlier), at eased progress t in (0, 1). Every cohort present in both
 * slides HOP_YEARS slots left while its values lerp; `x`/`label` keep the
 * `from` slot, because the axis ticks are built from them (only xPos moves).
 *
 * The two ends have no counterpart:
 *  - the youngest `from` cohorts weren't old enough to vote in `to`. They
 *    slide off the left edge at their real heights and fade.
 *  - the oldest `to` cohorts (ages 99-100) would be 101-102 in `from`,
 *    which has no row for them. They slide in from past the right edge
 *    (offAxis: no slot in `from`; the plot's clip hides them until they're
 *    in range) and fade in, so the right end doesn't go empty.
 *
 * Scrolling up plays the same hop backwards, which is also correct going
 * forward in time: t runs 1 -> 0 and every cohort ages two years.
 */
export function hopRows(from: PopulationBarRow[], to: PopulationBarRow[], t: number): PopulationBarRow[] {
  const toByAge = new Map(to.map((r) => [Number(r.x), r]));
  const fromAges = new Set(from.map((r) => Number(r.x)));

  const sliding = from.map((r) => {
    const age = Number(r.x);
    const target = toByAge.get(age - HOP_YEARS);
    const xPos = age - HOP_YEARS * t;
    if (!target) return { ...r, xPos, opacity: clamp01(1 - t / 0.4) };
    return {
      ...r,
      xPos,
      cvap: lerp(r.cvap, target.cvap, t),
      votes: lerp(r.votes, target.votes, t),
      expected: lerp(r.expected, target.expected, t),
      missing: lerp(r.missing, target.missing, t),
      registered: lerp(r.registered!, target.registered!, t),
      expectedRegistered: lerp(r.expectedRegistered!, target.expectedRegistered!, t),
      turnout: lerp(r.turnout, target.turnout, t),
    };
  });

  const arriving = to
    .filter((r) => !fromAges.has(Number(r.x) + HOP_YEARS))
    .map((r) => ({
      ...r,
      offAxis: true,
      xPos: Number(r.x) + HOP_YEARS * (1 - t),
      opacity: clamp01((t - 0.6) / 0.4),
    }));

  return [...sliding, ...arriving];
}
