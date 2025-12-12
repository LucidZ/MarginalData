import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="blog-layout">
      <h1>Marginal Data</h1>
      <section className="blog-content">
        <p>
          This site isn't supposed to be live yet, but welcome! I haven't
          figured out exactly what I want to do with this site yet. For now, I'm
          using it to play around with data interactions.
        </p>
      </section>

      <nav>
        <ul className="project-list">
          <li>
            <Link to="/2025/USAIDSize">How big was USAID?</Link>
          </li>
          <li>
            <Link to="/2025/ForeignAid">
              How does US Foreign Aid rank globally?
            </Link>
          </li>
          <li>
            <Link to="/2025/FederalEmployment">
              How big is US Federal Employment?
            </Link>
          </li>
          <li>
            <Link to="/2025/FuelEconomyTool">
              Compare vehicle fuel efficiency
            </Link>
          </li>
          <li>
            <Link to="/2025/FuelEconomyCurve">
              Fuel economy curve visualization
            </Link>
          </li>
          <li>
            <Link to="/2025/PizzaAreaComparison">
              How much more pizza is a large?
            </Link>
          </li>
          <li>
            <Link to="/2025/SolarAnimation">
              Solar Generation Explorer
            </Link>
          </li>
          <li>
            <Link to="/2025/ImageScrambler">
              Image Scrambler
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
