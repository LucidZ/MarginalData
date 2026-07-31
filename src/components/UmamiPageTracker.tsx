import { useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    umami?: {
      track: (event?: string | ((props: Record<string, unknown>) => Record<string, unknown>), data?: Record<string, unknown>) => void;
    };
  }
}

// Umami's auto-track only fires on pushState/popstate, which HashRouter never triggers.
// Auto-track is disabled in index.html; this fires the pageview manually on every route change.
export default function UmamiPageTracker() {
  const location = useLocation();

  useEffect(() => {
    window.umami?.track((props) => ({
      ...props,
      url: location.pathname + location.search,
    }));
  }, [location.pathname, location.search]);

  return null;
}
