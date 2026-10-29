import type { TrafficData } from "./types";

// One y ceiling for every day, every chart, so bars and curves compare
// across days. Rounded up to the next 500.
export const maxCount = (data: TrafficData) => {
  let max = 0;
  for (const day of data.days) {
    for (const c of Object.values(day.counts)) {
      for (const series of [c.eb, c.wb]) {
        for (const v of series ?? []) if (v !== null && v > max) max = v;
      }
    }
  }
  return Math.ceil(max / 500) * 500;
};

// Road strip x domain, in mileposts. Copper sits at 195, Genesee at 255.
export const MP_DOMAIN: [number, number] = [190, 260];

// Landmarks under the road. "ramp" marks an interchange that feeds traffic
// in between counters (caveat 1), "major" ones survive on phones. Empire
// sits 4 miles from Georgetown, so it drops to a second label row.
export const LANDMARKS: { mp: number; name: string; major?: boolean; row?: 1 }[] = [
  { mp: 205, name: "Silverthorne", major: true },
  { mp: 216, name: "Loveland" },
  { mp: 228, name: "Georgetown", major: true },
  { mp: 232, name: "Empire (US-40)", row: 1 },
  { mp: 240, name: "Idaho Springs" },
];
