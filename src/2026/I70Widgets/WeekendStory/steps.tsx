import type { ReactNode } from "react";
import { fmtInt } from "../../I70Crossfilter/format";
import { fmtPct } from "../HeroCurve/heroData";
import { POPULATION } from "../PopVsWeekend/population";
import { clockHour, dayName, departures, TM, topPeak, type ChartId, type Facts, type Highlight } from "./lensData";

// What the chart shows at each step and the one sentence beside it. Three
// charts (Saturday → Fri–Sun → Thu–Mon), 1996 against today; each step adds
// at most one gold highlight. Copy numbers come from the data (`Facts`: 1996
// and today on each chart, 3am to 3am), so they follow whichever season
// `last` is in index.tsx.

export interface Step {
  chart: ChartId;
  /** "today" keeps 1996 as the dashed reference. */
  season: "first" | "today";
  /** A function where the hours it picks out come from the data. */
  hl: Highlight | null | ((f: Facts) => Highlight);
  /** Scrolling from this step to the next plays the seasons from 1996 to today. */
  scrub?: boolean;
  /** Scrolling from this step to the next widens this chart's days out to the next step's chart. */
  zoom?: boolean;
  text: (f: Facts, yrs: { first: number; last: number }) => ReactNode;
}

const clock = (i: number) => {
  const h = clockHour(i);
  return h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h}am` : `${h - 12}pm`;
};
/** For prose ("30%"): no plus sign. */
const pctWord = (a: number, b: number) => fmtPct((b / a - 1) * 100).replace("+", "");
/** "26% fewer" for b against a. */
const fewer = (a: number, b: number) => `${fmtPct((1 - b / a) * 100).replace("+", "")} fewer`;
/** Growth from a to b as prose: "more than doubled", "nearly tripled", else "grew 69%". */
const grew = (a: number, b: number) => {
  const r = b / a;
  if (r >= 2.9) return `${r < 3 ? "nearly" : "more than"} tripled`;
  if (r >= 1.9) return `${r < 2 ? "nearly" : "more than"} doubled`;
  return `grew ${pctWord(a, b)}`;
};
const DAY_LONG: Record<string, string> = { Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
/** A Fri–Sun day index as a full name. */
const dayLong = (d: number) => DAY_LONG[dayName("friSun", d)] ?? dayName("friSun", d);
const Gold = ({ children }: { children: ReactNode }) => <span className="i70s-gold">{children}</span>;

// Saturday hours westbound (index 0 = 3am): 7am–5pm, the high plateau, and 6–7am, the early start.
const SAT_DAY: [number, number][] = [[4, 14]];
const SAT_EARLY: [number, number][] = [[3, 4]];
// Saturday eastbound: 10am–6pm, the day's return leaving early.
const SAT_EB_MID: [number, number][] = [[7, 15]];

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
    zoom: true,
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
    chart: "thuMon",
    season: "today",
    hl: null,
    text: () => (
      <>
        Plenty of skiers stretch the weekend with a day off. So which day should you take: Friday or Monday?
      </>
    ),
  },
  {
    chart: "thuMon",
    season: "today",
    hl: (f) => {
      const d = departures(f);
      return { kind: "pick", picks: [{ dir: "wb", i: d.thuUp }, { dir: "wb", i: d.friUp }] };
    },
    text: (f) => {
      const d = departures(f);
      const s = f.thuMon.now;
      return (
        <>
          Take Friday off and you can head up Thursday after work. Reach the tunnel at {clock(d.thuUp)} and there are{" "}
          <Gold>{fewer(s.wb[d.friUp], s.wb[d.thuUp])}</Gold> cars than at the same hour on Friday.
        </>
      );
    },
  },
  {
    chart: "thuMon",
    season: "today",
    hl: (f) => {
      const d = departures(f);
      return { kind: "pick", picks: [{ dir: "eb", i: d.sunHome }, { dir: "eb", i: d.monHome }] };
    },
    text: (f) => {
      const d = departures(f);
      const s = f.thuMon.now;
      const upSaving = 1 - s.wb[d.thuUp] / s.wb[d.friUp];
      const homeSaving = 1 - s.eb[d.monHome] / s.eb[d.sunHome];
      return (
        <>
          Take Monday off and you skip Sunday's rush home: at {clock(d.monHome)}, Monday has{" "}
          <Gold>{fewer(s.eb[d.sunHome], s.eb[d.monHome])}</Gold> cars than Sunday
          {homeSaving > upSaving ? ", the bigger of the two savings." : "."}
        </>
      );
    },
  },
  {
    chart: "thuMon",
    season: "today",
    hl: (f) => {
      const d = departures(f);
      return {
        kind: "pick",
        picks: [{ dir: "eb", i: d.sunHome }, { dir: "eb", i: d.monHome, holiday: true }],
        holidayLine: { dir: "eb", days: [TM.sun, TM.mon] },
      };
    },
    text: (f) => {
      const d = departures(f);
      const hol = f.holiday.now.eb[d.monHome];
      const sun = f.thuMon.now.eb[d.sunHome];
      const r = hol / sun;
      return (
        <>
          Unless everyone has the same idea. On MLK and Presidents' Day weekends, Monday at {clock(d.monHome)} brings{" "}
          <Gold>{fmtInt(hol)}</Gold> cars an hour home,{" "}
          {Math.abs(r - 1) < 0.08 ? "about as many as an ordinary Sunday." : `${Math.round(r * 100)}% of an ordinary Sunday.`}
        </>
      );
    },
  },
  {
    chart: "thuMon",
    season: "today",
    hl: (f) => {
      const d = departures(f);
      return { kind: "pick", picks: [{ dir: "wb", i: d.thuUp }, { dir: "eb", i: d.monHome }], then: true };
    },
    text: (f, { first }) => {
      const d = departures(f);
      const [t, n] = [f.thuMon.then, f.thuMon.now];
      return (
        <>
          And the quiet days are filling up. Since {first}, Thursday at {clock(d.thuUp)} heading up has{" "}
          <Gold>{grew(t.wb[d.thuUp], n.wb[d.thuUp])}</Gold>, and Monday at {clock(d.monHome)} heading home{" "}
          <Gold>{grew(t.eb[d.monHome], n.eb[d.monHome])}</Gold>.
        </>
      );
    },
  },
];
