import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Mark } from "../HeroCurve/HeroChart";
import type { Span } from "../HeroCurve/heroData";

// What the hero chart shows at each step, and the draft copy beside it.
// Numbers are the chart's own: 3-season averages, "1996" = 1996–97 and
// "today" = 2024–26 (see TODAY in index.tsx), Jan–Mar, holiday weekends out.

export interface Step {
  span: Span;
  season: "first" | "today";
  /** Keep 1996 as a dashed reference line. */
  pin: boolean;
  trail: boolean;
  marks?: Mark[];
  /** Red running total, westbound minus eastbound, from the span's start. */
  net?: boolean;
  /** Scrolling from this step to the next plays the seasons from 1996 to today. */
  scrub?: boolean;
  heading: string;
  body: ReactNode;
}

export const STEPS: Step[] = [
  {
    span: "sat",
    season: "today",
    pin: false,
    trail: false,
    heading: "One winter Saturday",
    body: (
      <>
        <p>
          This is an average winter Saturday at the Eisenhower Tunnel, hour by hour. Above the line are cars heading
          west, up to the ski areas. Below it are cars heading east, home to Denver.
        </p>
        <p>A wave goes up in the morning and a wave comes home in the afternoon: about 43,000 vehicles in all.</p>
      </>
    ),
  },
  {
    span: "sat",
    season: "first",
    pin: false,
    trail: false,
    scrub: true,
    heading: "Rewind to 1996",
    body: (
      <>
        <p>The same Saturday in 1996: about 34,000 vehicles.</p>
        <p>Keep scrolling to run it forward, one ski season at a time.</p>
      </>
    ),
  },
  {
    span: "sat",
    season: "today",
    pin: true,
    trail: true,
    heading: "28% more cars",
    body: (
      <p>
        Saturday traffic grew 28%. But the extra cars didn't pile onto the busiest hours. They went around them.
      </p>
    ),
  },
  {
    span: "sat",
    season: "today",
    pin: true,
    trail: true,
    marks: [
      { dir: "wb", hour: 6, anchor: "end" },
      { dir: "wb", hour: 8, anchor: "start" },
    ],
    heading: "Up before dawn",
    body: (
      <p>
        Heading up, 1996's busiest hour, 8 to 9am, is a little quieter now: 1,805 cars then, 1,622 now. The hour before
        it filled instead. Four times as many cars go through between 6 and 7am as in 1996.
      </p>
    ),
  },
  {
    span: "sat",
    season: "today",
    pin: true,
    trail: true,
    marks: [
      { dir: "eb", hour: 14, anchor: "end" },
      { dir: "eb", hour: 16, anchor: "start" },
    ],
    heading: "Home by 2",
    body: (
      <p>
        Coming home, the busiest hour moved two hours earlier, from 4–5pm to 2–3pm. The old peak hour barely changed. 2
        to 3pm doubled, and the noon hour went from 925 cars to 1,676.
      </p>
    ),
  },
  {
    span: "sat",
    season: "today",
    pin: true,
    trail: true,
    net: true,
    heading: "Who's up there",
    body: (
      <>
        <p>
          The red line keeps a running count from midnight: each car heading west adds one, each car heading east takes
          one away. It shows how many more vehicles are up in the mountains than when the day began (scale on the right).
        </p>
        <p>
          Today the count tops out around 3,400 by noon. In 1996 it kept climbing until 3pm, to 3,800. By 7pm it drops
          below zero: more cars come home on a Saturday than go up, so some of them went up before Saturday.
        </p>
      </>
    ),
  },
  {
    span: "friSun",
    season: "today",
    pin: true,
    trail: true,
    net: true,
    heading: "The weekend got longer",
    body: (
      <>
        <p>Widen the view to the whole weekend, Friday through Sunday. Together those three days grew 40%.</p>
        <p>
          Counting from Friday at midnight, about 10,500 extra cars are up the hill at Saturday's peak, up from 7,200 in
          1996.
        </p>
      </>
    ),
  },
  {
    span: "thuMon",
    season: "first",
    pin: false,
    trail: false,
    net: true,
    scrub: true,
    heading: "Thursday to Monday",
    body: <p>Add Thursday and Monday, go back to 1996, and run it forward again.</p>,
  },
  {
    span: "thuMon",
    season: "today",
    pin: true,
    trail: true,
    net: true,
    heading: "Friday caught up",
    body: (
      <p>
        In 1996 Friday ran well behind Saturday, 28,100 vehicles to 33,800. Now they're level: 44,200 and 43,500.
        Thursday and Monday each grew about 70%, Saturday 28%. Counting from Thursday, the crowd up the hill peaks at
        about 14,700 cars by Saturday noon, nearly double 1996's 8,200.
      </p>
    ),
  },
  {
    span: "thuMon",
    season: "today",
    pin: true,
    trail: true,
    net: true,
    heading: "Explore",
    body: (
      <p>
        Try other seasons, spans and pins in the <Link to="/2026/I70Widgets/HeroCurve">full chart</Link>.
      </p>
    ),
  },
];
