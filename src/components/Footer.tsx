import { Link } from "react-router-dom";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="site-footer">
      <nav className="site-footer-links" aria-label="Site">
        <Link to="/about">About</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/ai">AI Use</Link>
        <a
          href="https://github.com/LucidZ/MarginalData"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </nav>
      <p className="site-footer-note">Marginal Data — a personal project.</p>
    </footer>
  );
}
