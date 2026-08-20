import { useEffect, useState } from "react";

/**
 * Fetches a static JSON data file and exposes { data, error }.
 *
 * Unlike a bare `fetch(...).then(r => r.json())`, this:
 *  - treats non-2xx responses (e.g. a 404 for a missing/undeployed file) as
 *    an error instead of trying to JSON-parse an HTML error page
 *  - surfaces failures via `error` instead of only logging to the console,
 *    so callers can show a real error state instead of spinning forever
 */
export const useJsonData = <T,>(url: string): { data: T | null; error: Error | null } => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<T>;
      })
      .then((jsonData) => {
        if (!cancelled) setData(jsonData);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const normalized = err instanceof Error ? err : new Error(String(err));
        console.error(`Error loading data from ${url}:`, normalized);
        setError(normalized);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, error };
};
