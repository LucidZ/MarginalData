import { Link } from "react-router-dom";
import "./widgets.css";

// Every I-70 sketch, newest first. Candidates for a scrollyteller later.
const WIDGETS = [
  {
    path: "/2026/I70Widgets/WeekendStory",
    title: "The winter weekend warrior (story shell)",
    tag: "story",
    blurb:
      "Scrollyteller draft built around the hero chart: one Saturday today, rewind to 1996 and scroll forward, the dawn start and the earlier trip home, then the longer weekend.",
  },
  {
    path: "/2026/I70Widgets/HeroCurve",
    title: "The winter weekend, season by season",
    tag: "data",
    blurb:
      "Hero chart candidate: the average winter Saturday (or Fri–Sun, Thu–Mon, Wed–Wed) hour by hour at the Eisenhower Tunnel, westbound above and eastbound below, played back from 1996 with a faint trail and pinned seasons.",
  },
  {
    path: "/2026/I70Widgets/WeekendSpread",
    title: "The weekend got bigger, and longer",
    tag: "data",
    blurb:
      "Winter days since 1996 by day of the week: Saturdays grew, Fridays and Mondays grew faster, and Saturday's busiest hour hit a ceiling, so traffic spread into an earlier start and a fuller midday.",
  },
  {
    path: "/2026/I70Widgets/PopVsWeekend",
    title: "More Denver, more traffic?",
    tag: "data",
    blurb:
      "One dot per year: Denver's population against the average weekend day at each counter. Does mountain traffic grow with the city?",
  },
  {
    path: "/2026/I70Widgets/BrakeWave",
    title: "One tap, ten lanes",
    tag: "simulation",
    blurb:
      "Ten lanes of simulated drivers, arriving from one car every 5 seconds to one a second. Pull on reaction time, following gap and random braking, and see where flow tops out and waves start.",
  },
  {
    path: "/2026/I70Widgets/TravelTime",
    title: "Counting the cars in between",
    tag: "experiment",
    blurb:
      "How many cars are between Twin Tunnels and the Eisenhower Tunnel, from the gap between two running totals, and the speed that implies.",
  },
  {
    path: "/2026/I70Widgets/DailyVsPeak",
    title: "Busy hour, busy day",
    tag: "data",
    blurb:
      "Every day since 1996 as a dot: its busiest hour against its total. Where the hourly ceiling sits, and how far a day can grow past it.",
  },
  {
    path: "/2026/I70Widgets/TwoCounters",
    title: "Two counters, one rhythm",
    tag: "concept",
    blurb:
      "The same seven lanes with a second counter 2.33 miles on, the shortest gap where both click in unison. Same counts at both; only the trip time differs.",
  },
  {
    path: "/2026/I70Widgets/FlowVsSpeed",
    title: "Same count, different road",
    tag: "concept",
    blurb:
      "Seven lanes from 10 to 70 mph, each passing the counter at the same rate. Why a traffic count alone can't tell free flow from a crawl.",
  },
  {
    path: "/2026/I70Crossfilter",
    title: "Crossfilter explorer",
    tag: "data",
    blurb:
      "Every hour at Twin Tunnels, the Eisenhower Tunnel and Berthoud Pass since 1996, filtered by season, weekday, snow and holidays.",
  },
  {
    path: "/2026/I70Traffic",
    title: "Hour by hour road strip",
    tag: "data",
    blurb:
      "Four counters from Copper Mountain to Genesee on hand-picked days, played back hour by hour, with daily curves.",
  },
];

export default function I70Widgets() {
  return (
    <div className="i70w-root">
      <h1>I-70 Widgets</h1>
      <p className="i70w-intro">
        Sketches for an I-70 mountain corridor story. Each one stands alone for now.
      </p>
      <ul className="i70w-list">
        {WIDGETS.map((w) => (
          <li key={w.path}>
            <Link className="i70w-card" to={w.path}>
              <h2>
                {w.title}
                <span className="i70w-tag">{w.tag}</span>
              </h2>
              <p>{w.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
