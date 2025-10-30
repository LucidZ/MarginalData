import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="not-found">
      <h2>404 - Page Not Found</h2>
      <p>The requested project could not be found.</p>
      <Link to="/" className="home-link">
        Return to Homepage
      </Link>
    </div>
  );
}
