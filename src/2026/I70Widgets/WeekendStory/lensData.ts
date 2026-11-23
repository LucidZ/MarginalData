import type { Dataset } from "../../I70Crossfilter/types";
import { DOW_SHORT, sum, type Dir, type Prof, type Profiles } from "../HeroCurve/heroData";

// The story's charts (Saturday, Fri–Sun, Thu–Mon) and the gold highlights a
// step can lay over them. Every chart runs 3am to 3am, so the night's
// stragglers count with the day they belong to.

export type ChartId = "sat" | "friSun" | "thuMon";

/**
 * One hour's bar picked out: a departure. `tag` names it on the chart in
 * place of its day and hour; `tone` b is the sandbox's second trip; `holiday`
 * reads the hour from the holiday-weekend profile instead of the plain one.
 */
export interface Pick {
  dir: Dir;
  i: number;
  tag?: string;
  tone?: "a" | "b";
  holiday?: boolean;
}

/**
 * One step's gold layer. peak: each day's busiest-hour bar, or with `top`
 * just the chart's busiest hour for today and 1996. gap: the cars today adds
 * over 1996, limited to `ranges` (series hours [from, to)) when given (over a
 * shaded window unless `shade` is false). pick: whole bars at chosen hours,
 * with 1996's bar at the same hour behind each when `then`, and the holiday
 * weekend's line over `holidayLine.days` one way.
 */
export type Highlight =
  | { kind: "peak"; dirs: Dir[]; top?: boolean }
  | { kind: "gap"; dirs: Dir[]; ranges?: [number, number][]; shade?: boolean }
  | { kind: "pick"; picks: Pick[]; then?: boolean; holidayLine?: { dir: Dir; days: number[] } };

/** Hours each chart starts after midnight. */
export const OFFSET = 3;

// getUTCDay() order: 0 = Sunday.
export const CHARTS: Record<ChartId, { label: string; dows: number[] }> = {
  sat: { label: "Saturday", dows: [6] },
  friSun: { label: "Fri–Sun", dows: [5, 6, 0] },
  thuMon: { label: "Thu–Mon", dows: [4, 5, 6, 0, 1] },
};
export const CHART_IDS: ChartId[] = ["sat", "friSun", "thuMon"];

/** Clock hour (0–23) of an index into a chart's series. */
export const clockHour = (i: number) => (i + OFFSET) % 24;

/** The series index of a clock hour on one of the chart's days (hours before 3am belong to the day before). */
export const hourIndex = (day: number, clock: number) => day * 24 + ((clock - OFFSET + 24) % 24);

/** The chart's hours, 3am of its first day to 3am after its last, or null where a day isn't usable. */
export const lensSeries = (profiles: Profiles, yr: number, dows: number[], dir: Dir) => {
  const p = profiles.get(yr);
  if (!p) return null;
  const days = [...dows, (dows[dows.length - 1] + 1) % 7];
  const out: number[] = [];
  for (const dow of days) {
    const v = p[dow]?.[dir];
    if (!v) return null;
    out.push(...v);
  }
  return out.slice(OFFSET, OFFSET + dows.length * 24);
};

export interface Peak {
  day: number; // index into the chart's days
  dir: Dir;
  i: number; // index into the series
  v: number;
}

export interface Season {
  yr: number;
  wb: number[];
  eb: number[];
  /** Each day's total one way, 3am to 3am. */
  dayDir: Record<Dir, number[]>;
  /** Busiest hour per day and direction. */
  peaks: Peak[];
  total: number;
}

export const season = (profiles: Profiles, yr: number, chart: ChartId): Season | null => {
  const { dows } = CHARTS[chart];
  const wb = lensSeries(profiles, yr, dows, "wb");
  const eb = lensSeries(profiles, yr, dows, "eb");
  if (!wb || !eb) return null;
  const peaks: Peak[] = [];
  dows.forEach((_, d) => {
    for (const [dir, vals] of [["wb", wb], ["eb", eb]] as const) {
      let i = d * 24;
      for (let h = d * 24; h < (d + 1) * 24; h++) if (vals[h] > vals[i]) i = h;
      peaks.push({ day: d, dir, i, v: vals[i] });
    }
  });
  const daySum = (vals: number[], d: number) => vals.slice(d * 24, (d + 1) * 24).reduce((s, v) => s + v, 0);
  return {
    yr,
    wb,
    eb,
    dayDir: { wb: dows.map((_, d) => daySum(wb, d)), eb: dows.map((_, d) => daySum(eb, d)) },
    peaks,
    total: (sum(wb) ?? 0) + (sum(eb) ?? 0),
  };
};

/** Busiest hour over the whole chart in one direction. */
export const topPeak = (s: Season, dir: Dir) =>
  s.peaks.filter((p) => p.dir === dir).reduce((a, b) => (b.v > a.v ? b : a));

/** Busiest hour of one day in one direction. */
export const dayTop = (s: Season, day: number, dir: Dir) => s.peaks.find((p) => p.day === day && p.dir === dir)!;

export const dayName = (chart: ChartId, day: number) => DOW_SHORT[CHARTS[chart].dows[day]];

// --- Holiday weekends -------------------------------------------------------

/** Seasons the holiday weekend pools: two weekends a season is too few on their own. */
export const HOLIDAY_POOL = 3;
// days.json holiday codes for the two January–March Monday holidays.
const MLK = 1;
const PRESIDENTS = 2;

/**
 * The average MLK and Presidents' Day weekend, Thursday through the Tuesday
 * after (Tuesday for its 3am spill), stored by weekday like a season's
 * profile so the charts read it the same way. Keyed `last` for today's pool
 * (`last` and the seasons before it) and `first` for 1996's (`first` and
 * the seasons after).
 */
export const buildHolidayProfiles = (ds: Dataset, first: number, last: number): Profiles => {
  const pool = (years: number[]) => {
    const acc = new Map<number, { wb: number[]; eb: number[]; n: number }>();
    for (let i = 0; i < ds.n; i++) {
      const d = ds.dates[i];
      const h = ds.days.holiday[i];
      if ((h !== MLK && h !== PRESIDENTS) || d.getUTCDay() !== 1 || !years.includes(d.getUTCFullYear())) continue;
      for (let off = -4; off <= 1; off++) {
        const k = i + off;
        if (k < 0 || k >= ds.n || !ds.days.complete[k] || ds.days.closure[k]) continue;
        const dow = ds.dates[k].getUTCDay();
        let s = acc.get(dow);
        if (!s) acc.set(dow, (s = { wb: new Array(24).fill(0), eb: new Array(24).fill(0), n: 0 }));
        for (let hr = 0; hr < 24; hr++) {
          s.wb[hr] += ds.wb[k * 24 + hr];
          s.eb[hr] += ds.eb[k * 24 + hr];
        }
        s.n++;
      }
    }
    return Array.from({ length: 7 }, (_, dow): Prof => {
      const s = acc.get(dow);
      if (!s?.n) return { wb: null, eb: null, n: 0 };
      return { wb: s.wb.map((v) => v / s.n), eb: s.eb.map((v) => v / s.n), n: s.n };
    });
  };
  const span = (from: number) => Array.from({ length: HOLIDAY_POOL }, (_, k) => from + k);
  return new Map([
    [first, pool(span(first))],
    [last, pool(span(last - HOLIDAY_POOL + 1))],
  ]);
};

/** "2024–26" for the pool keyed by `yr`. */
export const holidayLabel = (yr: number, first: number) => {
  const [lo, hi] = yr === first ? [yr, yr + HOLIDAY_POOL - 1] : [yr - HOLIDAY_POOL + 1, yr];
  return `${lo}–${String(hi).slice(2)}`;
};

// --- What the copy quotes ----------------------------------------------------

/** 1996 and today on each chart, and the holiday weekend's Thu–Mon. */
export type Facts = Record<ChartId | "holiday", { then: Season; now: Season }>;

export const buildFacts = (profiles: Profiles, holiday: Profiles, first: number, last: number): Facts | null => {
  const out = {} as Facts;
  for (const [id, src, chart] of [...CHART_IDS.map((c) => [c, profiles, c] as const), ["holiday", holiday, "thuMon"] as const]) {
    const then = season(src, first, chart);
    const now = season(src, last, chart);
    if (!then || !now) return null;
    out[id] = { then, now };
  }
  return out;
};

// Thu–Mon days.
export const TM = { thu: 0, fri: 1, sat: 2, sun: 3, mon: 4 };

/**
 * The departure hours the day-off beats compare (series hours on Thu–Mon):
 * Friday's busiest hour heading up against the same hour Thursday, and
 * Sunday's busiest heading home against the same hour Monday, both today.
 */
export const departures = (f: Facts) => {
  const s = f.thuMon.now;
  const up = clockHour(dayTop(s, TM.fri, "wb").i);
  const home = clockHour(dayTop(s, TM.sun, "eb").i);
  return {
    thuUp: hourIndex(TM.thu, up),
    friUp: hourIndex(TM.fri, up),
    sunHome: hourIndex(TM.sun, home),
    monHome: hourIndex(TM.mon, home),
  };
};
