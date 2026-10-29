import { Link } from "react-router-dom";
import "./widgets.css";

// Every I-70 sketch, newest first. Candidates for a scrollyteller later.
const WIDGETS = [
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
