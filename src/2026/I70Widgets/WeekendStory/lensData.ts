import { DOW_SHORT, sum, type Dir, type Profiles } from "../HeroCurve/heroData";

// The story's three charts (Saturday, Fri–Sun, Wed–Tue), each read through
// three lenses (busiest hour, total cars, net up the hill). Every chart runs
// 3am to 3am, so a day's net is the change in its own window and the night's
// stragglers count with the day they belong to.

export type ChartId = "sat" | "friSun" | "wedTue";
export type Lens = "peak" | "total" | "net";

/** Hours each chart starts after midnight. */
export const OFFSET = 3;

// getUTCDay() order: 0 = Sunday. `dailyNet`: the net line starts over at
// 3am each day instead of running from the chart's start. A typical week
// doesn't net to zero (the counter reads westbound high, and January–March
// catches the season filling up but not all of its drain), and a running line
// piles that up into the week's end; reset daily, it stays a few hundred cars.
export const CHARTS: Record<ChartId, { label: string; dows: number[]; dailyNet: boolean }> = {
  sat: { label: "Saturday", dows: [6], dailyNet: false },
  friSun: { label: "Fri–Sun", dows: [5, 6, 0], dailyNet: false },
  wedTue: { label: "Wed–Tue", dows: [3, 4, 5, 6, 0, 1, 2], dailyNet: true },
};
export const CHART_IDS: ChartId[] = ["sat", "friSun", "wedTue"];

export const LENSES: Record<Lens, string> = {
  peak: "Busiest hour",
  total: "Total cars",
  net: "Net up the hill",
};
export const LENS_IDS: Lens[] = ["peak", "total", "net"];

/** Clock hour (0–23) of an index into a chart's series. */
export const clockHour = (i: number) => (i + OFFSET) % 24;

/** The chart's hours, 3am of its first day to 3am after its last, or null where a day isn't usable. */
export const lensSeries = (profiles: Profiles, yr: number, dows: number[], dir: Dir) => {
  const p = profiles.get(yr);
  if (!p) return null;
  const days = [...dows, (dows[dows.length - 1] + 1) % 7];
  const out: number[] = [];
  for (const dow of days) {
    const v = p[dow][dir];
    if (!v) return null;
    out.push(...v);
  }
  return out.slice(OFFSET, OFFSET + dows.length * 24);
};

/** Running westbound minus eastbound from the chart's start: one more point than hours. */
export const netSeries = (wb: number[] | null, eb: number[] | null) => {
  if (!wb || !eb) return null;
  const out = [0];
  for (let i = 0; i < wb.length; i++) out.push(out[i] + wb[i] - eb[i]);
  return out;
};

/** Net up the hill through one day, from 0 at its 3am: 25 points. */
export const dayNetLine = (net: number[], d: number) => net.slice(d * 24, d * 24 + 25).map((v) => v - net[d * 24]);

/** The net line as drawn: one running segment, or one per day where the chart resets daily. Segment k starts at hour k × 24. */
export const netSegments = (net: number[], chart: ChartId) =>
  CHARTS[chart].dailyNet ? CHARTS[chart].dows.map((_, d) => dayNetLine(net, d)) : [net];

/** The drawn net at the end of hour i. */
export const netAt = (net: number[], chart: ChartId, i: number) =>
  net[i + 1] - (CHARTS[chart].dailyNet ? net[Math.floor(i / 24) * 24] : 0);

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
  net: number[];
  /** Each day's total, both ways, 3am to 3am. */
  dayTotal: number[];
  /** Each day's total one way, 3am to 3am. */
  dayDir: Record<Dir, number[]>;
  /** Each day's net up the hill, 3am to 3am. */
  dayNet: number[];
  /** Busiest hour per day and direction. */
  peaks: Peak[];
  total: number;
  /** The chart's total one way. */
  totalDir: Record<Dir, number>;
}

export const season = (profiles: Profiles, yr: number, chart: ChartId): Season | null => {
  const { dows } = CHARTS[chart];
  const wb = lensSeries(profiles, yr, dows, "wb");
  const eb = lensSeries(profiles, yr, dows, "eb");
  const net = netSeries(wb, eb);
  if (!wb || !eb || !net) return null;
  const peaks: Peak[] = [];
  dows.forEach((_, d) => {
    for (const [dir, vals] of [["wb", wb], ["eb", eb]] as const) {
      let i = d * 24;
      for (let h = d * 24; h < (d + 1) * 24; h++) if (vals[h] > vals[i]) i = h;
      peaks.push({ day: d, dir, i, v: vals[i] });
    }
  });
  const daySum = (vals: number[], d: number) => vals.slice(d * 24, (d + 1) * 24).reduce((s, v) => s + v, 0);
  const dayDir = { wb: dows.map((_, d) => daySum(wb, d)), eb: dows.map((_, d) => daySum(eb, d)) };
  return {
    yr,
    wb,
    eb,
    net,
    dayTotal: dows.map((_, d) => dayDir.wb[d] + dayDir.eb[d]),
    dayDir,
    dayNet: dows.map((_, d) => net[(d + 1) * 24] - net[d * 24]),
    peaks,
    total: (sum(wb) ?? 0) + (sum(eb) ?? 0),
    totalDir: { wb: sum(wb) ?? 0, eb: sum(eb) ?? 0 },
  };
};

/** 1996 and today on each chart: the numbers the copy quotes. */
export type Facts = Record<ChartId, { then: Season; now: Season }>;

export const buildFacts = (profiles: Profiles, first: number, last: number): Facts | null => {
  const out = {} as Facts;
  for (const id of CHART_IDS) {
    const then = season(profiles, first, id);
    const now = season(profiles, last, id);
    if (!then || !now) return null;
    out[id] = { then, now };
  }
  return out;
};

/** Busiest hour over the whole chart in one direction. */
export const topPeak = (s: Season, dir: Dir) =>
  s.peaks.filter((p) => p.dir === dir).reduce((a, b) => (b.v > a.v ? b : a));

/** Busiest hour of one day, either direction. */
export const dayPeak = (s: Season, day: number) =>
  s.peaks.filter((p) => p.day === day).reduce((a, b) => (b.v > a.v ? b : a));

export const dayName = (chart: ChartId, day: number) => DOW_SHORT[CHARTS[chart].dows[day]];
