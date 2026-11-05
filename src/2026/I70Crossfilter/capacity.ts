import type { CounterId, Direction } from "./types";

export interface Range {
  lo: number;
  hi: number;
}

export interface Thresholds {
  /** Where speeds start to drop below free flow. */
  slow: Range;
  /** CDOT's capacity: past it, stop-and-go traffic can start at any time. */
  cap: Range;
}

// CDOT's "Existing (2000) Capacity", vehicles per hour, all through lanes in
// one direction: I-70 Mountain Corridor PEIS, Travel Demand Technical Report
// (Aug 2010), Appendix A, Tables A-21 to A-26. Capacity there is the LOS E/F
// boundary, built as a per-lane flow for the posted speed (HCM 2000) times
// the stretch's own factors: peak-hour, trucks and grade, weekend drivers,
// shoulders and winter weather.
//
// Each counter takes the lowest capacity between it and the last on-ramp
// upstream (nothing can join after that), and each range runs across CDOT's
// three day types (winter weekend, summer weekend, summer weekday). US-40 at
// Berthoud isn't in the PEIS, so it has no entry.
interface PeisRow {
  /** PEIS highway stretch and milepost. */
  row: string;
  posted: number;
  /** Winter weekend, summer weekend, summer weekday. */
  cap: [number, number, number];
}

const PEIS: Partial<Record<CounterId, Record<Direction, PeisRow>>> = {
  // Table A-19 ties the EJMT counter to the lane drop east of the merge.
  tunnel: {
    eb: { row: "Lane Drop-EJMT, MP 213", posted: 50, cap: [2400, 2850, 2700] },
    wb: { row: "Loveland Pass-EJMT, MP 216", posted: 65, cap: [2430, 2630, 2440] },
  },
  twin: {
    eb: { row: "Twin Tunnels, MP 242", posted: 55, cap: [3420, 3430, 3570] },
    wb: { row: "Twin Tunnels, MP 242", posted: 55, cap: [3420, 3430, 3570] },
  },
  genesee: {
    eb: { row: "Genesee-Lookout Mtn, MP 255", posted: 55, cap: [5380, 5400, 5360] },
    wb: { row: "Lookout Mtn-Genesee, MP 255", posted: 65, cap: [4720, 4490, 4200] },
  },
};

// The PEIS takes its per-lane capacity from HCM 2000, 1,700 + 10 x speed
// (2,200 at 50 mph, its own extension below HCM's 55). In the same HCM speed-
// flow curves, speed holds at free flow up to 3,400 - 30 x speed per lane.
// Scaling CDOT's capacity by that ratio keeps all of CDOT's I-70 factors.
// This step is our calculation; CDOT doesn't publish a slowdown volume.
const slowShare = (mph: number) => (3400 - 30 * mph) / (1700 + 10 * mph);
const round10 = (v: number) => Math.round(v / 10) * 10;
const range = (vals: number[]): Range => ({ lo: Math.min(...vals), hi: Math.max(...vals) });

const derive = (r: PeisRow): Thresholds => ({
  cap: range(r.cap),
  slow: range(r.cap.map((c) => round10(c * slowShare(r.posted)))),
});

export const THRESHOLDS: Partial<Record<CounterId, Record<Direction, Thresholds>>> = Object.fromEntries(
  Object.entries(PEIS).map(([id, d]) => [id, { wb: derive(d.wb), eb: derive(d.eb) }]),
);

/** Charts with a vehicles-per-hour scale reach at least this far past the capacity band's top. */
export const CAPACITY_HEADROOM = 1.15;

export const thresholdsFor = (counter: CounterId, dir: Direction): Thresholds | null =>
  THRESHOLDS[counter]?.[dir] ?? null;

/** Top of a fixed vehicles-per-hour axis that fits both directions' bands, or null with no band. */
export const capacityTop = (counter: CounterId): number | null => {
  const t = THRESHOLDS[counter];
  return t ? Math.max(t.wb.cap.hi, t.eb.cap.hi) * CAPACITY_HEADROOM : null;
};

/** The note under any chart that shows (or would show) the bands. */
export const capacityNote = (counter: CounterId): string => {
  if (!THRESHOLDS[counter]) return "CDOT hasn't published a capacity for US-40 here, so there are no red bands.";
  const base =
    "Red band: CDOT's estimated capacity for this stretch, the most vehicles an hour it can carry before " +
    "stop-and-go traffic becomes likely (I-70 Mountain Corridor PEIS, 2010, from 2000 conditions). Pale band: " +
    "where speeds start to drop. CDOT doesn't publish that one, so it's our estimate: CDOT's capacity scaled by " +
    "the Highway Capacity Manual's ratio for the posted speed, which keeps CDOT's adjustments for trucks, grades, " +
    "weather and out-of-town drivers. Ranges cover winter weekends, summer weekends and summer weekdays. " +
    "General guidance only";
  return counter === "twin"
    ? `${base}: at Twin Tunnels, a tunnel widening and peak-period express lanes (eastbound 2015, westbound 2021) have added room since.`
    : `${base}.`;
};
