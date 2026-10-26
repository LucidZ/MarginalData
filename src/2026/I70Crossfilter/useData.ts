import { useEffect, useState } from "react";
import type { Dataset, DaysFile } from "./types";

const daysUrl = "/data/i70-crossfilter/days.json";
const hoursUrl = "/data/i70-crossfilter/hours.bin";

const fetchOk = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return res;
};

/** days.json + hours.bin (Uint16 little-endian: wb[days*24] then eb[days*24]). */
export const useData = () => {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchOk(daysUrl).then((r) => r.json() as Promise<DaysFile>),
      fetchOk(hoursUrl).then((r) => r.arrayBuffer()),
    ])
      .then(([days, buf]) => {
        const n = days.holiday.length;
        if (buf.byteLength !== n * 24 * 2 * 2) throw new Error(`hours.bin size mismatch for ${n} days`);
        const start = Date.parse(`${days.start}T00:00:00Z`);
        const dates = Array.from({ length: n }, (_, i) => new Date(start + i * 86400000));
        if (!cancelled)
          setData({
            days,
            n,
            dates,
            wb: new Uint16Array(buf, 0, n * 24),
            eb: new Uint16Array(buf, n * 24 * 2, n * 24),
          });
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
