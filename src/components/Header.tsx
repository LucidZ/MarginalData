import { Link } from "react-router-dom";
import "./Header.css";

export default function Header() {
  return (
    <header className="site-header">
      <Link to="/" className="site-header-brand">
        Marginal Data
      </Link>
    </header>
  );
}
