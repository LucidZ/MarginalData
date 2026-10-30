import { MISSING, type Dataset, type Direction } from "../../I70Crossfilter/types";

// Cars on the stretch between Twin Tunnels and the Eisenhower Tunnel, from
// cumulative counts (Newell N-curves). Count every car past each counter from
// 3am and scale the upstream count by the share that reaches the downstream
// counter (assumed constant all day). The vertical gap between the two
// running totals is the number of cars between the counters: each hour,
// n = n before + in − out. The night anchors it: at 3am and midnight the
// stretch holds what free flow would, and n is never allowed below zero. Divide
// by the miles to get cars per mile; flow / (cars per mile) = speed.
// Hourly counts make each curve piecewise linear between hour marks; that is
// the only interpolation.

/** Start counting here, when the road between the counters is nearly empty. */
export const H0 = 3;
/** Twin Tunnels counter (MP ~242) to the Eisenhower Tunnel counter (MP ~214). */
export const MILES = 28;
/** Lanes each way, for spacing per lane and the jam ceiling. */
export const LANES = 2;
/** Feet per stopped car in a jam: car plus a few feet. */
const JAM_FT = 25;
/** Every lane packed with stopped cars. */
export const JAM_CARS = Math.round((MILES * 5280 * LANES) / JAM_FT);

export interface Sets {
  twin: Dataset;
  tunnel: Dataset;
  berthoud: Dataset;
}

export interface DayCurves {
  /** Upstream scale: chosen so the day starts and ends at free flow. */
  share: number;
  /** Hour marks H0..24 and the cumulative counts at each. */
  hours: number[];
  /** Starts at `startCars`: the cars already on the stretch at 3am. */
  up: number[];
  down: number[];
  total: number;
  /** Hourly flows, upstream already scaled by `share`. */
  upFlow: number[];
  downFlow: number[];
  /** Free-flow loads the day is anchored to at 3am and midnight. */
  startCars: number;
  endCars: number;
  /** Cars on the stretch at each hour mark: n = n before + in − out. */
  rawCars: number[];
  /** Same, never allowed below zero. */
  cars: number[];
}

export interface HourRow {
  /** Hour start; the row describes hour..hour+1. */
  hour: number;
  /** Cars between the counters, averaged over the hour. */
  cars: number;
  /** Cars per hour through the stretch (mean of both ends). */
  flow: number;
  /** Cars the stretch would hold at the free-flow speed. */
  freeFlowCars: number;
  /** True when cars <= freeFlowCars: assumed free flow. */
  free: boolean;
  /** flow / (cars per mile), capped at the free-flow speed. */
  mph: number;
  /** Raw (unfloored) cars, for spotting impossible hours. */
  rawCars: number;
}

const hourly = (ds: Dataset, dir: Direction, day: number) => {
  const a = dir === "wb" ? ds.wb : ds.eb;
  const out: number[] = [];
  for (let h = H0; h < 24; h++) {
    const v = a[day * 24 + h];
    if (v === MISSING) return null;
    out.push(v);
  }
  return out;
};

const cumulative = (xs: number[]) => {
  const out = [0];
  for (const x of xs) out.push(out[out.length - 1] + x);
  return out;
};

export const upstreamName = (dir: Direction, berthoud: boolean) =>
  dir === "wb" ? "Twin Tunnels" : berthoud ? "Eisenhower Tunnel + Berthoud" : "Eisenhower Tunnel";
export const downstreamName = (dir: Direction, berthoud: boolean) =>
  dir === "eb" ? "Twin Tunnels" : berthoud ? "Eisenhower Tunnel + Berthoud" : "Eisenhower Tunnel";

/** Cars on the stretch at free flow: flow × miles ÷ speed. */
const freeLoad = (flowPerHour: number, freeMph: number) => (flowPerHour * MILES) / freeMph;

/**
 * Westbound: Twin Tunnels upstream; Tunnel (+ Berthoud northbound) downstream.
 * Eastbound: Tunnel (+ Berthoud southbound) upstream; Twin Tunnels downstream.
 * Null when any counter is missing an hour from 3am on.
 */
export const dayCurves = (
  sets: Sets,
  day: number,
  dir: Direction,
  berthoud: boolean,
  freeMph: number,
): DayCurves | null => {
  const twin = hourly(sets.twin, dir, day);
  const tunnel = hourly(sets.tunnel, dir, day);
  const bert = berthoud ? hourly(sets.berthoud, dir, day) : tunnel?.map(() => 0);
  if (!twin || !tunnel || !bert) return null;
  const through = tunnel.map((v, i) => v + bert[i]);
  const [upRaw, downFlow] = dir === "wb" ? [twin, through] : [through, twin];
  const sumUp = upRaw.reduce((a, b) => a + b, 0);
  const sumDown = downFlow.reduce((a, b) => a + b, 0);
  if (sumUp < 500 || sumDown < 500) return null;
  // The night is free flow: start at 3am and end at midnight with what free
  // flow holds (downstream flow, the measured one), and pick the share so
  // start + share × in − out lands on the end value.
  const startCars = freeLoad(downFlow[0], freeMph);
  const endCars = freeLoad(downFlow[downFlow.length - 1], freeMph);
  const share = (sumDown + endCars - startCars) / sumUp;
  const upFlow = upRaw.map((v) => v * share);
  const up = cumulative(upFlow).map((v) => v + startCars);
  const down = cumulative(downFlow);
  const rawCars = up.map((v, i) => v - down[i]);
  const cars = [startCars];
  for (let i = 0; i < upFlow.length; i++) cars.push(Math.max(0, cars[i] + upFlow[i] - downFlow[i]));
  return {
    share,
    hours: up.map((_, i) => H0 + i),
    up,
    down,
    total: down[down.length - 1],
    upFlow,
    downFlow,
    startCars,
    endCars,
    rawCars,
    cars,
  };
};

/** Cars between the counters at time t (fractional hour), floored at zero. */
export const carsAt = (c: DayCurves, t: number) => {
  const i = Math.min(Math.max(Math.floor(t - H0), 0), c.hours.length - 2);
  const f = Math.min(Math.max(t - c.hours[i], 0), 1);
  return c.cars[i] + (c.cars[i + 1] - c.cars[i]) * f;
};

export const hourRows = (c: DayCurves, freeMph: number): HourRow[] =>
  c.upFlow.map((u, i) => {
    const cars = (c.cars[i] + c.cars[i + 1]) / 2;
    const rawCars = (c.rawCars[i] + c.rawCars[i + 1]) / 2;
    const flow = (u + c.downFlow[i]) / 2;
    const freeFlowCars = freeLoad(flow, freeMph);
    const free = cars <= freeFlowCars;
    const mph = free ? freeMph : (flow * MILES) / cars;
    return {
      hour: H0 + i,
      cars,
      rawCars,
      flow,
      freeFlowCars,
      free,
      mph,
    };
  });

/** Busiest-traffic window for "slowest hour": 6am to 9pm. */
const isDaytime = (r: HourRow) => r.hour >= 6 && r.hour < 21;

export const slowestHour = (rows: HourRow[]) => rows.filter(isDaytime).reduce((a, b) => (b.mph < a.mph ? b : a));

/** Hours (daytime) with fewer than zero cars between the counters. */
export const impossibleHours = (rows: HourRow[]) => rows.filter((r) => isDaytime(r) && r.rawCars < 0).length;

// Kinds of day for the calibration strip. Quiet shoulder-season midweek days
// are the test: the road should be at free flow all day.
export const KINDS: { label: string; test: (d: Date) => boolean }[] = [
  {
    label: "Quiet midweek, spring/fall",
    test: (d) => [3, 4, 9, 10].includes(d.getUTCMonth()) && [2, 3, 4].includes(d.getUTCDay()),
  },
  {
    label: "Ski-season Saturday",
    test: (d) => isSki(d) && d.getUTCDay() === 6,
  },
  { label: "Ski-season Sunday", test: (d) => isSki(d) && d.getUTCDay() === 0 },
  { label: "Summer Saturday", test: (d) => isSummer(d) && d.getUTCDay() === 6 },
  { label: "Summer Sunday", test: (d) => isSummer(d) && d.getUTCDay() === 0 },
];
const isSki = (d: Date) => d.getUTCMonth() === 11 || d.getUTCMonth() <= 2;
const isSummer = (d: Date) => d.getUTCMonth() >= 5 && d.getUTCMonth() <= 7;

export const CALIBRATION_FROM = 2015;

export interface CalPoint {
  day: number;
  kind: number;
  /** Slowest daytime hour, mph. */
  mph: number;
  slowHour: number;
  impossible: number;
}

/** Each day's slowest daytime hour, for every day of each kind since CALIBRATION_FROM. */
export const calibration = (sets: Sets, dir: Direction, berthoud: boolean, freeMph: number): CalPoint[] => {
  const { dates, n } = sets.twin;
  const out: CalPoint[] = [];
  for (let i = 0; i < n; i++) {
    const d = dates[i];
    if (d.getUTCFullYear() < CALIBRATION_FROM) continue;
    const kind = KINDS.findIndex((k) => k.test(d));
    if (kind < 0) continue;
    const c = dayCurves(sets, i, dir, berthoud, freeMph);
    // A share far from the usual ~0.8 / ~1.2 means a counter glitch or closure.
    if (!c || c.share < 0.5 || c.share > 2) continue;
    const rows = hourRows(c, freeMph);
    const slow = slowestHour(rows);
    out.push({
      day: i,
      kind,
      mph: slow.mph,
      slowHour: slow.hour,
      impossible: impossibleHours(rows),
    });
  }
  return out;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const kindSummary = (pts: CalPoint[]) =>
  KINDS.map((_, k) => {
    const xs = pts.filter((p) => p.kind === k);
    if (!xs.length) return null;
    return {
      mph: median(xs.map((p) => p.mph)),
      impossibleShare: xs.filter((p) => p.impossible > 0).length / xs.length,
    };
  });
