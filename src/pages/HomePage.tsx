import { Link } from "react-router-dom";
import { ROUTES } from "../routes";
import "./HomePage.css";

const GROUP_ORDER = [
  "Government & Politics",
  "Personal Finance",
  "Soccer Analytics",
  "Decision-Making",
  "Everyday Comparisons",
  "Explorers & Simulators",
];

const GROUPS = GROUP_ORDER.map((title) => ({
  title,
  routes: ROUTES.filter((route) => route.group === title),
}));

export default function Home() {
  return (
    <div className="blog-layout">
      <h1>Marginal Data</h1>
      <section className="blog-content">
        <p>
          Marginal Data is a collection of small interactive experiments in
          data and visualization — some serious (how marginal tax rates
          actually work), some just for fun (how much bigger is a large
          pizza, really?). Pick something below and poke around.
        </p>
      </section>

      {GROUPS.map((group) => (
        <section key={group.title} className="home-group">
          <h2 className="home-group-title">{group.title}</h2>
          <nav>
            <ul className="project-list">
              {group.routes.map((route) => (
                <li key={route.path}>
                  <Link to={route.path}>{route.title.split(" — ")[0]}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </section>
      ))}
    </div>
  );
}
