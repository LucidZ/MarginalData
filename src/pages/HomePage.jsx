import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="blog-layout">
      <h1>My Interactive Projects Blog</h1>
      <nav>
        <ul className="project-list">
          <li>
            <Link to="/2025/USAIDSize">How big was USAID?</Link>
          </li>
        </ul>
      </nav>

      <section className="blog-content">
        {/* Add your blog content here */}
        <p>Welcome to my interactive projects showcase!</p>
      </section>
    </div>
  );
}
