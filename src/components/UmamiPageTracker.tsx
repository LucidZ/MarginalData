import { useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    umami?: {
      track: (event?: string | ((props: Record<string, unknown>) => Record<string, unknown>), data?: Record<string, unknown>) => void;
    };
  }
}

// Auto-track is disabled in index.html (data-auto-track="false") to avoid double-counting
// pushState navigations against this manual tracker; this fires the pageview on every route change.
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
