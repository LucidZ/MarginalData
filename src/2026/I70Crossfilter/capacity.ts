import type { CounterId, Direction } from "./types";

export interface Capacity {
  lo: number;
  hi: number;
}

// CDOT's "Existing (2000) Capacity", vehicles per hour, all through lanes in
// one direction: I-70 Mountain Corridor PEIS, Travel Demand Technical Report
// (Aug 2010), Appendix A, Tables A-21 to A-26. Capacity there is the LOS E/F
// boundary, where stop-and-go traffic can start at any time; it already
// allows for trucks, grade, weekend drivers and winter weather.
//
// Each counter takes the lowest capacity between it and the last on-ramp
// upstream (nothing can join after that), and each range runs across CDOT's
// three day types (winter weekend, summer weekend, summer weekday). US-40 at
// Berthoud isn't in the PEIS, so it has no entry.
export const CAPACITY: Partial<Record<CounterId, Record<Direction, Capacity>>> = {
  // EB: Lane Drop-EJMT, MP 213 (Table A-19 ties the counter to it). WB: Loveland Pass-EJMT, MP 216.
  tunnel: { eb: { lo: 2400, hi: 2850 }, wb: { lo: 2430, hi: 2630 } },
  // Twin Tunnels, MP 242, both directions.
  twin: { eb: { lo: 3420, hi: 3570 }, wb: { lo: 3420, hi: 3570 } },
  // EB: Genesee-Lookout Mtn, MP 255. WB: Lookout Mtn-Genesee, MP 255.
  genesee: { eb: { lo: 5360, hi: 5400 }, wb: { lo: 4200, hi: 4720 } },
};

/** Charts with a vehicles-per-hour scale reach at least this far past the band's top. */
export const CAPACITY_HEADROOM = 1.15;

export const capacityFor = (counter: CounterId, dir: Direction): Capacity | null => CAPACITY[counter]?.[dir] ?? null;

/** Top of a fixed vehicles-per-hour axis that fits both directions' bands, or null with no band. */
export const capacityTop = (counter: CounterId): number | null => {
  const c = CAPACITY[counter];
  return c ? Math.max(c.wb.hi, c.eb.hi) * CAPACITY_HEADROOM : null;
};

/** The one-line note under any chart that shows (or would show) the band. */
export const capacityNote = (counter: CounterId): string => {
  if (!CAPACITY[counter]) return "CDOT hasn't published a capacity for US-40 here, so there's no red band.";
  const base =
    "Red: CDOT's estimated capacity for this stretch, the most vehicles an hour it can carry before stop-and-go " +
    "traffic becomes likely (I-70 Mountain Corridor PEIS, 2010, from 2000 conditions; the range covers winter " +
    "weekends, summer weekends and summer weekdays). General guidance only";
  return counter === "twin"
    ? `${base}: at Twin Tunnels, a tunnel widening and peak-period express lanes (eastbound 2015, westbound 2021) have added room since.`
    : `${base}.`;
};
