import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="page-content not-found">
      <h2>404 - Page Not Found</h2>
      <p>The requested project could not be found.</p>
      <p>
        <Link to="/">Back to the homepage</Link>
      </p>
    </div>
  );
}
