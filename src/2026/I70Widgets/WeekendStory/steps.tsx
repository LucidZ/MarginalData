import type { ReactNode } from "react";
import { fmtInt } from "../../I70Crossfilter/format";
import { fmtPct } from "../HeroCurve/heroData";
import { POPULATION } from "../PopVsWeekend/population";
import { clockHour, topPeak, type ChartId, type Facts, type Highlight, type Season } from "./lensData";

// What the chart shows at each step and the one sentence beside it. Three
// charts (Saturday → Fri–Sun → Wed–Tue), 1996 against today; each step adds
// at most one gold highlight. Copy numbers come from the data (`Facts`: 1996
// and today on each chart, 3am to 3am), so they follow whichever season
// `last` is in index.tsx.

export interface Step {
  chart: ChartId;
  /** "today" keeps 1996 as the dashed reference. */
  season: "first" | "today";
  hl: Highlight | null;
  /** Scrolling from this step to the next plays the seasons from 1996 to today. */
  scrub?: boolean;
  text: (f: Facts, yrs: { first: number; last: number }) => ReactNode;
}

const clock = (i: number) => {
  const h = clockHour(i);
  return h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h}am` : `${h - 12}pm`;
};
/** For prose ("30%"): no plus sign. */
const pctWord = (a: number, b: number) => fmtPct((b / a - 1) * 100).replace("+", "");
const hundreds = (v: number) => fmtInt(Math.round(v / 100) * 100);
const sumRange = (vals: number[], [lo, hi]: [number, number]) => vals.slice(lo, hi).reduce((t, v) => t + v, 0);
const bothWays = (s: Season, ranges: [number, number][]) =>
  ranges.reduce((t, r) => t + sumRange(s.wb, r) + sumRange(s.eb, r), 0);
const Gold = ({ children }: { children: ReactNode }) => <span className="i70s-gold">{children}</span>;

// Saturday hours 3am–8am: the early start.
const SAT_EARLY: [number, number][] = [[0, 5]];
// Wed–Tue: Friday 3pm to the end of Sunday's day (3am Monday), and the rest of the week.
const WEEKEND: [number, number][] = [[2 * 24 + 12, 5 * 24]];
const REST: [number, number][] = [
  [0, 2 * 24 + 12],
  [5 * 24, 7 * 24],
];
const WT = { thu: 1, fri: 2, sun: 4 };
const FRI_SUN = ["Friday", "Saturday", "Sunday"];

/** City of Denver, the one population series that reaches back to 1996. */
export const popGrowth = (first: number) => {
  const city = POPULATION.city;
  const latest = Math.max(...Object.keys(city).map(Number));
  return { pct: city[latest] / city[first] - 1, latest };
};

export const STEPS: Step[] = [
  {
    chart: "sat",
    season: "first",
    hl: null,
    text: (_, { first }) => (
      <>
        This is an average winter Saturday at the Eisenhower Tunnel in {first}: cars heading up to the ski areas
        above the line, cars heading home to Denver below it.
      </>
    ),
  },
  {
    chart: "sat",
    season: "first",
    hl: { kind: "peak", dirs: ["wb", "eb"] },
    text: (f) => (
      <>
        It's the classic weekend warrior: drive up in the morning (busiest at{" "}
        <Gold>{clock(topPeak(f.sat.then, "wb").i)}</Gold>), ski, and drive home in the afternoon (busiest at{" "}
        <Gold>{clock(topPeak(f.sat.then, "eb").i)}</Gold>).
      </>
    ),
  },
  {
    chart: "sat",
    season: "first",
    hl: null,
    scrub: true,
    text: (_, { first }) => <>Over the next 30 winters, Denver grew by about {Math.round((popGrowth(first).pct * 100) / 5) * 5}%…</>,
  },
  {
    chart: "sat",
    season: "today",
    hl: { kind: "gap", dirs: ["wb", "eb"] },
    text: (f) => (
      <>
        …and winter Saturday traffic grew by <Gold>{pctWord(f.sat.then.total, f.sat.now.total)}</Gold>.
      </>
    ),
  },
  {
    chart: "sat",
    season: "today",
    hl: { kind: "gap", dirs: ["wb"], ranges: SAT_EARLY },
    text: (f) => {
      // The 6am hour, westbound.
      const r = f.sat.now.wb[3] / f.sat.then.wb[3];
      return (
        <>
          With more people heading up, drivers started leaving earlier to beat the traffic: the 6am hour now carries{" "}
          <Gold>{r >= 1.95 ? `${Math.round(r)} times` : `${pctWord(1, r)} more`}</Gold> {r >= 1.95 ? "as many cars" : "cars"}.
        </>
      );
    },
  },
  {
    chart: "sat",
    season: "today",
    hl: { kind: "gap", dirs: ["wb", "eb"], rows: true },
    text: (f) => {
      const { then, now } = f.sat;
      const [w, e] = [now.totalDir.wb / then.totalDir.wb - 1, now.totalDir.eb / then.totalDir.eb - 1];
      const ratio = e / w;
      const vs = ratio >= 1.7 && ratio <= 2.3 ? "nearly double" : ratio > 1.2 ? "well ahead of" : "about the same as";
      return (
        <>
          But traffic home grew <Gold>{pctWord(then.totalDir.eb, now.totalDir.eb)}</Gold>, {vs} the{" "}
          <Gold>{pctWord(then.totalDir.wb, now.totalDir.wb)}</Gold> heading up. Why?
        </>
      );
    },
  },
  {
    chart: "friSun",
    season: "today",
    hl: { kind: "peak", dirs: ["wb"] },
    text: (f) => {
      const [t, n] = [topPeak(f.friSun.then, "wb").i, topPeak(f.friSun.now, "wb").i];
      const at = (i: number) => `${FRI_SUN[Math.floor(i / 24)]} at ${clock(i)}`;
      return (
        <>
          Widen to the whole weekend: the busiest hour heading up moved from <Gold>{at(t)}</Gold> to{" "}
          <Gold>{at(n)}</Gold>
          {FRI_SUN[Math.floor(n / 24)] === "Friday" && clockHour(n) >= 15 ? ", after work" : ""}.
        </>
      );
    },
  },
  {
    chart: "friSun",
    season: "today",
    hl: { kind: "net" },
    text: () => (
      <>
        The gold line is the net: each car heading up adds one, each car heading home takes one away, starting over at
        3am each day.
      </>
    ),
  },
  {
    chart: "friSun",
    season: "today",
    hl: { kind: "net", days: [0] },
    text: (f, { first }) => (
      <>
        More and more people go up early and stay starting Friday night: Friday now leaves{" "}
        <Gold>{hundreds(f.friSun.now.dayNet[0])}</Gold> more in the mountains than it brings home, up from{" "}
        {hundreds(f.friSun.then.dayNet[0])} in {first}.
      </>
    ),
  },
  {
    chart: "wedTue",
    season: "today",
    hl: { kind: "gap", dirs: ["wb", "eb"], ranges: WEEKEND },
    text: (f) => (
      <>
        Over the whole week, traffic from Friday after work through Sunday grew{" "}
        <Gold>{pctWord(bothWays(f.wedTue.then, WEEKEND), bothWays(f.wedTue.now, WEEKEND))}</Gold>…
      </>
    ),
  },
  {
    chart: "wedTue",
    season: "today",
    hl: { kind: "gap", dirs: ["wb", "eb"], ranges: REST },
    text: (f) => (
      <>
        …and the rest of the week grew <Gold>{pctWord(bothWays(f.wedTue.then, REST), bothWays(f.wedTue.now, REST))}</Gold>.
      </>
    ),
  },
  {
    chart: "wedTue",
    season: "today",
    hl: { kind: "net", days: [WT.thu, WT.fri, WT.sun] },
    text: (f, { first }) => {
      const [t, n] = [f.wedTue.then.dayNet[WT.sun], f.wedTue.now.dayNet[WT.sun]];
      const sameSunday = Math.abs(n - t) < Math.abs(t) * 0.1;
      return (
        <>
          Way more people now stay up Thursday and Friday night, but{" "}
          {sameSunday
            ? `Sunday sends no more home than it did in ${first}?`
            : `Sunday's net trip home only went from ${hundreds(-t)} to ${hundreds(-n)}?`}
        </>
      );
    },
  },
];
