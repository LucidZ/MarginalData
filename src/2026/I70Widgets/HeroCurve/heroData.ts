import type { Dataset } from "../../I70Crossfilter/types";

// Data side of the hero chart: the average January–March day at the
// Eisenhower Tunnel per season and weekday. Shared by the HeroCurve widget and
// the WeekendStory scrollyteller.

export type Span = "sat" | "friSun" | "thuMon" | "wedWed";
export type Mode = "smooth" | "raw";
export type Dir = "wb" | "eb";

// getUTCDay() order: 0 = Sunday.
export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const SPANS: Record<Span, { label: string; dows: number[] }> = {
  sat: { label: "Saturday", dows: [6] },
  friSun: { label: "Fri–Sun", dows: [5, 6, 0] },
  thuMon: { label: "Thu–Mon", dows: [4, 5, 6, 0, 1] },
  wedWed: { label: "Wed–Wed", dows: [3, 4, 5, 6, 0, 1, 2, 3] },
};

// Tunnel WB timestamps ran up to ~1.25 h early from 2006 until the counter
// was serviced in May 2010. Those seasons are still drawn, flagged with an
// asterisk, but kept out of clean seasons' 3-season averages.
export const DRIFT_WB = { from: 2006, to: 2010 };
export const isDrift = (y: number) => y >= DRIFT_WB.from && y <= DRIFT_WB.to;

export interface Prof {
  wb: number[] | null; // 24 hourly means, null = not usable
  eb: number[] | null;
  n: number; // days averaged
}
/** profiles[year][dow] */
export type Profiles = Map<number, Prof[]>;

/** Hourly sums per season and weekday over usable days (Jan–Mar, complete, no closure; holiday weekends included). */
const buildSums = (ds: Dataset) => {
  const sums = new Map<number, { wb: number[]; eb: number[]; n: number }[]>();
  for (let i = 0; i < ds.n; i++) {
    const d = ds.dates[i];
    if (d.getUTCMonth() > 2) continue;
    if (!ds.days.complete[i] || ds.days.closure[i]) continue;
    const y = d.getUTCFullYear();
    let yr = sums.get(y);
    if (!yr) sums.set(y, (yr = Array.from({ length: 7 }, () => ({ wb: new Array(24).fill(0), eb: new Array(24).fill(0), n: 0 }))));
    const s = yr[d.getUTCDay()];
    for (let h = 0; h < 24; h++) {
      s.wb[h] += ds.wb[i * 24 + h];
      s.eb[h] += ds.eb[i * 24 + h];
    }
    s.n++;
  }
  return sums;
};

/** Per-season means, or centered 3-season means (day-weighted) when smoothing. */
export const buildProfiles = (ds: Dataset, mode: Mode): Profiles => {
  const sums = buildSums(ds);
  const years = [...sums.keys()].sort((a, b) => a - b);
  const out: Profiles = new Map();
  for (const y of years) {
    const window = mode === "smooth" ? [y - 1, y, y + 1] : [y];
    const profs: Prof[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const avg = (dir: Dir) => {
        const acc = new Array(24).fill(0);
        let n = 0;
        for (const wy of window) {
          if (dir === "wb" && !isDrift(y) && isDrift(wy)) continue;
          const s = sums.get(wy)?.[dow];
          if (!s || !s.n) continue;
          for (let h = 0; h < 24; h++) acc[h] += s[dir][h];
          n += s.n;
        }
        return n ? { vals: acc.map((v) => v / n), n } : null;
      };
      const wb = avg("wb");
      const eb = avg("eb");
      profs.push({ wb: wb?.vals ?? null, eb: eb?.vals ?? null, n: eb?.n ?? 0 });
    }
    out.set(y, profs);
  }
  return out;
};

/** The span's hours laid end to end, or null where a day has no usable profile. */
export const spanSeries = (p: Prof[] | undefined, dows: number[], dir: Dir) => {
  if (!p) return null;
  const out: number[] = [];
  for (const dow of dows) {
    const v = p[dow][dir];
    if (!v) return null;
    out.push(...v);
  }
  return out;
};

export const sum = (a: number[] | null) => (a ? a.reduce((s, v) => s + v, 0) : null);

export const fmtPct = (v: number) => {
  const r = Math.round(v);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}%`;
};

/** "1996–97" for a smoothed season (window clipped to the data), "1996" for a single one. */
export const seasonLabel = (yr: number, mode: Mode, first: number, last: number) => {
  if (mode === "raw") return String(yr);
  const lo = Math.max(first, yr - 1);
  const hi = Math.min(last, yr + 1);
  return `${lo}–${String(hi).slice(2)}`;
};

/** Vehicles over the span in a season, per direction and both ways (null where a direction isn't usable). */
export const spanTotal = (profiles: Profiles, yr: number, dows: number[]) => {
  const w = sum(spanSeries(profiles.get(yr), dows, "wb"));
  const e = sum(spanSeries(profiles.get(yr), dows, "eb"));
  return { w, e, both: w != null && e != null ? w + e : null };
};
