import { Link } from "react-router-dom";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="site-footer">
      <nav className="site-footer-links" aria-label="Site">
        <Link to="/about">About</Link>
        <a
          href="https://github.com/LucidZ/MarginalData"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <a href="/rss.xml">RSS</a>
      </nav>
      <p className="site-footer-note">Marginal Data — a personal project.</p>
    </footer>
  );
}
