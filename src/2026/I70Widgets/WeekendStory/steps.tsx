import type { ReactNode } from "react";
import { fmtInt } from "../../I70Crossfilter/format";
import { fmtPct } from "../HeroCurve/heroData";
import { POPULATION } from "../PopVsWeekend/population";
import { clockHour, dayName, topPeak, type ChartId, type Facts, type Highlight, type Season } from "./lensData";

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
  /** Scrolling from this step to the next widens this chart's days out to the next step's chart. */
  zoom?: boolean;
  /** The net: 0 none, 1 each hour's net, 2 stacked into the running net, 3 with 1996's drawn in. */
  flow?: number;
  /** Scrolling from this step to the next plays `flow` from this step's to the next's. */
  play?: boolean;
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
const DAY_LONG: Record<string, string> = { Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
/** A Fri–Sun day index as a full name. */
const dayLong = (d: number) => DAY_LONG[dayName("friSun", d)] ?? dayName("friSun", d);
const Gold = ({ children }: { children: ReactNode }) => <span className="i70s-gold">{children}</span>;

// Saturday hours westbound (index 0 = 3am): 7am–5pm, the high plateau, and 6–7am, the early start.
const SAT_DAY: [number, number][] = [[4, 14]];
const SAT_EARLY: [number, number][] = [[3, 4]];
// Saturday eastbound: 10am–6pm, the day's return leaving early.
const SAT_EB_MID: [number, number][] = [[7, 15]];
// Wed–Tue: Friday 3pm to the end of Sunday's day (3am Monday), and the rest of the week.
const WEEKEND: [number, number][] = [[2 * 24 + 12, 5 * 24]];
const REST: [number, number][] = [
  [0, 2 * 24 + 12],
  [5 * 24, 7 * 24],
];
const WT = { thu: 1, fri: 2, sun: 4 };

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
        This was an average winter Saturday at the Eisenhower Tunnel in {first}. Vehicles heading up into Summit County
        above the line, and then heading towards Denver below it.
      </>
    ),
  },
  {
    chart: "sat",
    season: "first",
    hl: { kind: "peak", dirs: ["wb", "eb"] },
    text: (f) => (
      <>
        It reflects the classic weekend warrior driving up in the morning (peak traffic at{" "}
        <Gold>{clock(topPeak(f.sat.then, "wb").i)}</Gold>), skiing, and driving home in the afternoon (peak traffic at{" "}
        <Gold>{clock(topPeak(f.sat.then, "eb").i)}</Gold>).
      </>
    ),
  },
  {
    chart: "sat",
    season: "first",
    hl: null,
    scrub: true,
    text: (f) => (
      <>
        Over the next 30 winters, Saturday traffic grew by <Gold>{pctWord(f.sat.then.total, f.sat.now.total)}</Gold>.
      </>
    ),
  },
  {
    chart: "sat",
    season: "today",
    hl: null,
    text: () => (
      <>
        ...but the shape of that traffic changed as well.
      </>
    ),
  },
  {
    chart: "sat",
    season: "today",
    hl: { kind: "gap", dirs: ["wb"], ranges: SAT_DAY, shade: false },
    text: () => (
      <>
        Instead of a defined peak early in the morning, westbound traffic stays consistently high through most of the
        day.
      </>
    ),
  },
  {
    chart: "sat",
    season: "today",
    hl: { kind: "gap", dirs: ["wb"], ranges: SAT_EARLY, shade: false },
    text: (f) => {
      // The 6am hour, westbound.
      const r = f.sat.now.wb[3] / f.sat.then.wb[3];
      return (
        <>
          And more early birds are trying to beat traffic: by 7am there are already{" "}
          <Gold>{r >= 1.95 ? `${Math.round(r)} times` : `${pctWord(1, r)} more`}</Gold> {r >= 1.95 ? "as many vehicles" : "vehicles"}{" "}
          going through the tunnel.
        </>
      );
    },
  },
  {
    chart: "sat",
    season: "today",
    hl: { kind: "gap", dirs: ["eb"], ranges: SAT_EB_MID, shade: false },
    zoom: true,
    text: () => (
      <>
        Curiously, traffic away from the mountains also begins peaking by mid morning, suggesting traffic going up and
        staying in the mountains has started overshadowing single-day trippers.
      </>
    ),
  },
  {
    chart: "friSun",
    season: "today",
    hl: null,
    text: () => <>We can see more evidence of this when we expand our look to the whole weekend.</>,
  },
  {
    chart: "friSun",
    season: "today",
    hl: { kind: "peak", dirs: ["wb"], top: true },
    text: (f, { first }) => {
      const [t, n] = [topPeak(f.friSun.then, "wb"), topPeak(f.friSun.now, "wb")];
      return (
        <>
          In {first}, the busiest hour heading up was {dayLong(t.day)} at {clock(t.i)}. Today it's{" "}
          <Gold>
            {dayLong(n.day)} at {clock(n.i)}
          </Gold>
          : the weekend now starts right after work.
        </>
      );
    },
  },
  {
    chart: "friSun",
    season: "today",
    hl: { kind: "peak", dirs: ["eb"], top: true },
    play: true,
    text: (f) => {
      const [t, n] = [topPeak(f.friSun.then, "eb"), topPeak(f.friSun.now, "eb")];
      return (
        <>
          The busiest hour heading home used to be {dayLong(t.day)} at {clock(t.i)}, after a last day on the slopes.
          Today it's{" "}
          <Gold>
            {dayLong(n.day)} at {clock(n.i)}
          </Gold>
          , as weekenders head down before the rush.
        </>
      );
    },
  },
  {
    chart: "friSun",
    season: "today",
    hl: null,
    flow: 1,
    play: true,
    text: () => (
      <>
        Take each hour's cars heading home away from its cars heading up, and what's left is that hour's{" "}
        <Gold>net</Gold>: more staying up the hill, or more coming home.
      </>
    ),
  },
  {
    chart: "friSun",
    season: "today",
    hl: null,
    flow: 2,
    play: true,
    text: () => (
      <>
        Stack those hours end to end, starting over at 3am, and you get each day's <Gold>net up the hill</Gold>.
      </>
    ),
  },
  {
    chart: "friSun",
    season: "today",
    hl: { kind: "net", days: [0] },
    flow: 3,
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
