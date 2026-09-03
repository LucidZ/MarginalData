import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ROUTES, type RouteEntry } from "../routes";
import "./HomePage.css";

const GROUP_ORDER = [
  "Government & Politics",
  "Environment",
  "Personal Finance",
  "Soccer Analytics",
  "Decision-Making",
  "Everyday Comparisons",
  "Explorers & Simulators",
];

// Reverse-chron is close to quality order for this site (see
// project_public_launch_plan.md §2) — newest first, oldest last.
const FEED: RouteEntry[] = [...ROUTES].sort((a, b) =>
  b.date.localeCompare(a.date)
);

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default function Home() {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      activeGroup ? FEED.filter((route) => route.group === activeGroup) : FEED,
    [activeGroup]
  );

  return (
    <div className="blog-layout">
      <h1>Marginal Data</h1>

      <nav className="home-filters" aria-label="Filter by topic">
        <button
          type="button"
          className={activeGroup === null ? "home-filter is-active" : "home-filter"}
          onClick={() => setActiveGroup(null)}
        >
          All
        </button>
        {GROUP_ORDER.map((group) => (
          <button
            key={group}
            type="button"
            className={
              activeGroup === group ? "home-filter is-active" : "home-filter"
            }
            onClick={() => setActiveGroup(group)}
          >
            {group}
          </button>
        ))}
      </nav>

      <ul className="home-feed">
        {visible.map((route) => (
          <li key={route.path} className="home-card">
            <Link to={route.path} className="home-card-thumb-link">
              {route.image ? (
                <img
                  className="home-card-thumb"
                  src={route.image}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="home-card-thumb home-card-thumb-placeholder" aria-hidden="true">
                  {route.title.charAt(0)}
                </span>
              )}
            </Link>
            <div className="home-card-body">
              <div className="home-card-meta">
                <time dateTime={route.date}>{formatDate(route.date)}</time>
                <span className="home-card-group">{route.group}</span>
              </div>
              <h2 className="home-card-title">
                <Link to={route.path}>{route.title.split(" — ")[0]}</Link>
              </h2>
              <p className="home-card-note">{route.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
