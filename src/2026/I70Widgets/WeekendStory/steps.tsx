import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { fmtInt } from "../../I70Crossfilter/format";
import { fmtPct } from "../HeroCurve/heroData";
import type { Dir } from "../HeroCurve/heroData";
import { CHART_IDS, CHARTS, clockHour, dayNetLine, dayPeak, LENS_IDS, LENSES, topPeak, type ChartId, type Facts, type Lens, type Season } from "./lensData";

// What the chart shows at each step, and the draft copy beside it. The story
// is three charts (Saturday → Fri–Sun → Wed–Tue), each read through the same
// three lenses (busiest hour → total cars → net up the hill). Copy numbers
// come from the data (`Facts`: 1996 and today on each chart, 3am to 3am), so
// they follow whichever season `last` is in index.tsx.

export interface Step {
  chart: ChartId;
  season: "first" | "today";
  /** Keep 1996 as the dashed reference. */
  pin: boolean;
  lens: Lens | null;
  /** Scrolling from this step to the next plays the seasons from 1996 to today. */
  scrub?: boolean;
  heading: string;
  body: (f: Facts, yrs: { first: number; last: number }) => ReactNode;
}

const clock = (i: number) => {
  const h = clockHour(i);
  return h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h}am` : `${h - 12}pm`;
};
const pct = (a: number, b: number) => fmtPct((b / a - 1) * 100);
/** For prose ("30% more"): no plus sign. */
const pctWord = (a: number, b: number) => pct(a, b).replace("+", "");
const signed = (v: number) => `${v > 0.5 ? "+" : v < -0.5 ? "−" : ""}${fmtInt(Math.abs(v))}`;
const sumDays = (s: Season, days: number[]) => days.reduce((t, d) => t + s.dayTotal[d], 0);
/** A day's change on the first season, one way. */
const dayGrowth = (then: Season, now: Season, dir: Dir, d: number) => now.dayDir[dir][d] / then.dayDir[dir][d] - 1;
// Wed–Tue day indices.
const WT = { wed: 0, thu: 1, fri: 2, sat: 3, sun: 4, mon: 5, tue: 6 };
const MIDWEEK = [WT.mon, WT.tue, WT.wed, WT.thu];
const WEEKEND = [WT.fri, WT.sat, WT.sun];
const FRI_SUN = ["Friday", "Saturday", "Sunday"];
const fsDay = (i: number) => FRI_SUN[Math.floor(i / 24)];

export const STEPS: Step[] = [
  {
    chart: "sat",
    season: "first",
    pin: false,
    lens: null,
    scrub: true,
    heading: "One winter Saturday",
    body: (f, { first }) => (
      <>
        <p>
          This is an average winter Saturday at the Eisenhower Tunnel in {first}, hour by hour from 3am to 3am. Above the
          line are cars heading west, up to the ski areas. Below it are cars heading east, home to Denver.
        </p>
        <p>A wave goes up in the morning and a wave comes home in the afternoon: about {fmtInt(f.sat.then.total)} vehicles.</p>
        <p>Keep scrolling to run it forward, one ski season at a time.</p>
      </>
    ),
  },
  {
    chart: "sat",
    season: "today",
    pin: true,
    lens: "peak",
    heading: "Saturday · the busiest hour",
    body: (f, { first, last }) => {
      const [tw, nw] = [topPeak(f.sat.then, "wb"), topPeak(f.sat.now, "wb")];
      const [te, ne] = [topPeak(f.sat.then, "eb"), topPeak(f.sat.now, "eb")];
      return (
        <>
          <p className="i70s-howto">
            We'll read each chart three ways: its busiest hour, its total, and how many people it leaves in the
            mountains. Gold marks the one we're on.
          </p>
          <p>
            The gold dots are the busiest hour each way, hollow for {first} and filled for {last}. Heading up, it's{" "}
            {nw.v <= tw.v * 1.03 ? "no busier than" : `${pctWord(tw.v, nw.v)} busier than`} in {first}: {fmtInt(tw.v)} cars at{" "}
            {clock(tw.i)} then, {fmtInt(nw.v)} at {clock(nw.i)} now. Coming home, it moved from {clock(te.i)} to{" "}
            {clock(ne.i)} and grew {pctWord(te.v, ne.v)}.
          </p>
        </>
      );
    },
  },
  {
    chart: "sat",
    season: "today",
    pin: true,
    lens: "total",
    heading: "Saturday · total cars",
    body: (f, { first, last }) => {
      const { then, now } = f.sat;
      const way = (dir: Dir) =>
        `${pctWord(then.totalDir[dir], now.totalDir[dir])} more (${fmtInt(then.totalDir[dir])} → ${fmtInt(now.totalDir[dir])})`;
      return (
        <p>
          Now the gold is every car {last} adds over {first}. Saturday carries {pctWord(then.total, now.total)} more
          traffic, {fmtInt(then.total)} → {fmtInt(now.total)}, but the two directions didn't grow alike: heading up,{" "}
          {way("wb")}; coming home, {way("eb")}. Little of the gold sits on the old peaks. It went into the early
          morning and the middle of the day.
        </p>
      );
    },
  },
  {
    chart: "sat",
    season: "today",
    pin: true,
    lens: "net",
    heading: "Saturday · net up the hill",
    body: (f, { first }) => {
      const [t, n] = [f.sat.then.dayNet[0], f.sat.now.dayNet[0]];
      return (
        <>
          <p>
            The gold line keeps a running count from 3am: each car heading west adds one, each car heading east takes one
            away (scale on the right).
          </p>
          <p>
            In {first}, Saturday left {fmtInt(t)} more vehicles in the mountains than it brought home. Now it's {signed(n)}
            {n < 0 ? ": more go home on a Saturday than go up" : ""}. Saturday doesn't fill the mountains any more.
            Somebody got there first.
          </p>
        </>
      );
    },
  },
  {
    chart: "friSun",
    season: "today",
    pin: true,
    lens: "peak",
    heading: "Fri–Sun · the busiest hour",
    body: (f, { first }) => {
      const [tw, nw] = [topPeak(f.friSun.then, "wb"), topPeak(f.friSun.now, "wb")];
      const satNow = f.friSun.now.peaks.find((p) => p.day === 1 && p.dir === "wb")!;
      return (
        <p>
          Widen to the whole weekend. In {first} the busiest hour heading up was {fsDay(tw.i)} at {clock(tw.i)} (
          {fmtInt(tw.v)} cars). Now it's {fsDay(nw.i)} at {clock(nw.i)} ({fmtInt(nw.v)}), while Saturday tops out at{" "}
          {fmtInt(satNow.v)}.
        </p>
      );
    },
  },
  {
    chart: "friSun",
    season: "today",
    pin: true,
    lens: "total",
    heading: "Fri–Sun · total cars",
    body: (f) => {
      const { then, now } = f.friSun;
      const g = (dir: Dir, d: number) => fmtPct(dayGrowth(then, now, dir, d) * 100).replace("+", "");
      const [w, e] = [now.totalDir.wb / then.totalDir.wb - 1, now.totalDir.eb / then.totalDir.eb - 1];
      // Days whose trips home grew faster than their trips up.
      const homeHeavy = [0, 1, 2].filter((d) => dayGrowth(then, now, "eb", d) > dayGrowth(then, now, "wb", d));
      return (
        <p>
          The weekend carries {pctWord(then.total, now.total)} more cars:{" "}
          {Math.abs(w - e) < 0.03 ? "nearly the same each way, " : ""}
          {fmtPct(w * 100).replace("+", "")} more heading up and {fmtPct(e * 100).replace("+", "")} more coming home. Day by
          day it splits. Trips up grew {g("wb", 0)} on Friday, {g("wb", 1)} on Saturday and {g("wb", 2)} on Sunday; trips
          home grew {g("eb", 0)}, {g("eb", 1)} and {g("eb", 2)}.
          {homeHeavy.length === 1 && ` Only on ${FRI_SUN[homeHeavy[0]]} did the trip home grow faster than the trip up.`}
        </p>
      );
    },
  },
  {
    chart: "friSun",
    season: "today",
    pin: true,
    lens: "net",
    heading: "Fri–Sun · net up the hill",
    body: (f, { first }) => {
      const [t, n] = [f.friSun.then.dayNet, f.friSun.now.dayNet];
      return (
        <p>
          Counting from Friday at 3am: Friday now leaves {fmtInt(n[0])} more vehicles up than it brings back, up from {fmtInt(t[0])}{" "}
          in {first}. Saturday nets {signed(n[1])}, and Sunday brings {fmtInt(Math.abs(n[2]))} home. The mountains
          fill up a day earlier.
        </p>
      );
    },
  },
  {
    chart: "wedTue",
    season: "today",
    pin: true,
    lens: "peak",
    heading: "Wed–Tue · the busiest hour",
    body: (f) => {
      const g = (d: number) => dayPeak(f.wedTue.now, d).v / dayPeak(f.wedTue.then, d).v - 1;
      const mid = MIDWEEK.map(g);
      return (
        <p>
          Now the whole week, Wednesday to Tuesday, with each day's busiest hour each way. The weekend's peaks barely
          rose: Saturday's {fmtPct(g(WT.sat) * 100)}, Sunday's {fmtPct(g(WT.sun) * 100)}. Monday through Thursday's rose{" "}
          {fmtPct(Math.min(...mid) * 100).replace("+", "")} to {fmtPct(Math.max(...mid) * 100).replace("+", "")}.
        </p>
      );
    },
  },
  {
    chart: "wedTue",
    season: "today",
    pin: true,
    lens: "total",
    heading: "Wed–Tue · total cars",
    body: (f, { first }) => {
      const { then, now } = f.wedTue;
      const [mt, mn, wt, wn] = [sumDays(then, MIDWEEK), sumDays(now, MIDWEEK), sumDays(then, WEEKEND), sumDays(now, WEEKEND)];
      return (
        <>
          <p>
            A winter week carries {pctWord(then.total, now.total)} more cars than in {first}. Most of the extra cars didn't
            come on the weekend: Monday to Thursday added {fmtInt(mn - mt)} a week ({pct(mt, mn)}), Friday to Sunday{" "}
            {fmtInt(wn - wt)} ({pct(wt, wn)}).
          </p>
          <p>
            A Wednesday today ({fmtInt(now.dayTotal[WT.wed])} vehicles) is as busy as a Friday was in {first} (
            {fmtInt(then.dayTotal[WT.fri])}).
          </p>
          <p className="i70s-howto">
            Over a whole week the two directions should grow alike, since what goes up comes back. Westbound shows{" "}
            {pct(then.totalDir.wb, now.totalDir.wb)} and eastbound {pct(then.totalDir.eb, now.totalDir.eb)}; most of that
            gap is the counter, whose westbound side read below eastbound in {first} and reads above it now.
          </p>
        </>
      );
    },
  },
  {
    chart: "wedTue",
    season: "today",
    pin: true,
    lens: "net",
    heading: "Wed–Tue · net up the hill",
    body: (f, { first }) => {
      const { then, now } = f.wedTue;
      const pair = (d: number) => `${signed(then.dayNet[d])} → ${signed(now.dayNet[d])}`;
      // Saturday's high point, to the nearest hundred.
      const satHigh = Math.round(Math.max(...dayNetLine(now.net, WT.sat)) / 100) * 100;
      const roundTrip = Math.abs(now.dayNet[WT.sat]) < satHigh / 2;
      return (
        <>
          <p>
            Now the gold starts over at 3am each day and ends on that day's net. People go up Wednesday to Friday and come
            down at the weekend's end. In {first}, Friday and Saturday did the filling. Now Thursday and Friday do:
            Thursday {pair(WT.thu)}, Friday {pair(WT.fri)}.
          </p>
          {roundTrip && (
            <p>
              Saturday became a round trip. The gold still climbs through the morning, to about {signed(satHigh)} by
              midday, but it's back to {signed(now.dayNet[WT.sat])} by 3am. In {first}, Saturday left{" "}
              {signed(then.dayNet[WT.sat])} up the hill overnight.
            </p>
          )}
          <p className="i70s-howto">
            Added up, the days don't come back to zero. Part of that is the counter, whose westbound side reads a little
            high, and part is the calendar: January to March catches the ski season filling up but not all of its drain in
            late March and April.
          </p>
        </>
      );
    },
  },
  {
    chart: "wedTue",
    season: "today",
    pin: true,
    lens: null,
    heading: "Three charts, three readings",
    body: (f) => (
      <>
        <SummaryTable f={f} />
        <p>
          Try other seasons and spans in the <Link to="/2026/I70Widgets/HeroCurve">full chart</Link>.
        </p>
      </>
    ),
  },
];

/** One short line per cell of the 3×3: the tracker above the chart and the closing table. */
export const cellText = (f: Facts, chart: ChartId, lens: Lens): string => {
  const { then, now } = f[chart];
  if (lens === "total") return `↑ ${pct(then.totalDir.wb, now.totalDir.wb)}  ↓ ${pct(then.totalDir.eb, now.totalDir.eb)}`;
  if (lens === "peak") {
    if (chart === "sat") {
      const [a, b] = [topPeak(then, "wb"), topPeak(now, "wb")];
      return b.v <= a.v * 1.03 ? "No busier going up" : `Up ${pct(a.v, b.v)}`;
    }
    if (chart === "friSun") {
      const short = (i: number) => fsDay(i).slice(0, 3);
      return `Busiest trip up: ${short(topPeak(then, "wb").i)} → ${short(topPeak(now, "wb").i)}`;
    }
    const g = (d: number) => dayPeak(now, d).v / dayPeak(then, d).v - 1;
    const mid = MIDWEEK.map(g);
    return `Weekend ${fmtPct(Math.max(g(WT.sat), g(WT.sun)) * 100)}, Mon–Thu ${fmtPct(Math.max(...mid) * 100)}`;
  }
  if (chart === "sat") return `${signed(then.dayNet[0])} → ${signed(now.dayNet[0])}`;
  if (chart === "friSun") return `Fri ${signed(then.dayNet[0])} → ${signed(now.dayNet[0])}`;
  return "Fills Thu–Fri, not Sat";
};

export const stepIndexOf = (chart: ChartId, lens: Lens) => STEPS.findIndex((s) => s.chart === chart && s.lens === lens);

function SummaryTable({ f }: { f: Facts }) {
  return (
    <table className="i70s-summary">
      <thead>
        <tr>
          <th />
          {LENS_IDS.map((l) => (
            <th key={l}>{LENSES[l]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {CHART_IDS.map((c) => (
          <tr key={c}>
            <th>{CHARTS[c].label}</th>
            {LENS_IDS.map((l) => (
              <td key={l}>{cellText(f, c, l)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
