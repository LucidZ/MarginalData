import { useEffect, useState } from "react";
import type { Dataset, DaysJson } from "./types";

const daysUrl = "/data/i70-crossfilter/days.json";
const hoursUrl = "/data/i70-crossfilter/hours.bin";

const fetchOk = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return res;
};

/**
 * days.json + hours.bin (Uint16 little-endian; per counter, in days.json's
 * `counters` order: wb[days*24] then eb[days*24]). One Dataset per counter.
 */
export const useData = () => {
  const [data, setData] = useState<Dataset[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchOk(daysUrl).then((r) => r.json() as Promise<DaysJson>),
      fetchOk(hoursUrl).then((r) => r.arrayBuffer()),
    ])
      .then(([json, buf]) => {
        const { counters, ...shared } = json;
        const n = shared.holiday.length;
        const block = n * 24 * 2; // bytes per direction
        if (buf.byteLength !== counters.length * 2 * block)
          throw new Error(`hours.bin size mismatch for ${n} days x ${counters.length} counters`);
        const start = Date.parse(`${shared.start}T00:00:00Z`);
        const dates = Array.from({ length: n }, (_, i) => new Date(start + i * 86400000));
        const sets = counters.map((c, k) => ({
          days: { ...shared, ...c },
          n,
          dates,
          wb: new Uint16Array(buf, 2 * k * block, n * 24),
          eb: new Uint16Array(buf, (2 * k + 1) * block, n * 24),
        }));
        if (!cancelled) setData(sets);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        console.error(e);
        setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
};
