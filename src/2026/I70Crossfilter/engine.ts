import crossfilter from "crossfilter2";
import type { BinSpec, BinValue, Dataset, Direction, FilterId, Filters, Snapshot } from "./types";
import { MISSING } from "./types";

// One crossfilter record per (day, hour): record r = day * 24 + hour.
//
// Two traps the custom reduces exist for:
//  1. Averages, not sums. A month with more days isn't busier, so every
//     day-level group tracks its sum AND its number of distinct days, and
//     the chart shows sum / days.
//  2. Day-level charts over hour rows. With hours filtered to 7-9 AM a day
//     contributes 3 records; it must still count as one day. Each bin keeps
//     a per-day hit count and only counts the day on its first hit.

interface DayReduce {
  wb: number;
  eb: number;
  nDays: number;
  hits: Uint8Array;
}

interface HourReduce {
  wb: number;
  eb: number;
  wbN: number;
  ebN: number;
}

type Dim = crossfilter.Dimension<number, number>;

const TOP_N = 10;

export const createEngine = (data: Dataset, specs: BinSpec[]) => {
  const { n, wb, eb, days } = data;
  const records = Array.from({ length: n * 24 }, (_, r) => r);
  const cf = crossfilter(records);
  let dir: Direction = "wb";
  let filters: Filters | null = null;

  const dayReduce = (group: crossfilter.Group<number, number, number>) =>
    (group as unknown as crossfilter.Group<number, number, DayReduce>).reduce(
      (p: DayReduce, r: number) => {
        const v = wb[r];
        const w = eb[r];
        if (v !== MISSING) p.wb += v;
        if (w !== MISSING) p.eb += w;
        if (p.hits[(r / 24) | 0]++ === 0) p.nDays++;
        return p;
      },
      (p: DayReduce, r: number) => {
        const v = wb[r];
        const w = eb[r];
        if (v !== MISSING) p.wb -= v;
        if (w !== MISSING) p.eb -= w;
        if (--p.hits[(r / 24) | 0] === 0) p.nDays--;
        return p;
      },
      () => ({ wb: 0, eb: 0, nDays: 0, hits: new Uint8Array(n) }),
    );

  // Day-level filter dimensions. Directional ones (daily total, saturated
  // hours) are rebuilt when the direction changes.
  const dims = new Map<FilterId, { dim: Dim; group: crossfilter.Group<number, number, DayReduce> }>();
  const buildDim = (spec: BinSpec) => {
    const dim = cf.dimension((r: number) => spec.key((r / 24) | 0, dir));
    dims.set(spec.id, { dim, group: dayReduce(dim.group()) });
  };
  specs.forEach(buildDim);

  const hourDim = cf.dimension((r: number) => r % 24);
  const hourGroup = (hourDim.group() as unknown as crossfilter.Group<number, number, HourReduce>).reduce(
    (p: HourReduce, r: number) => {
      if (wb[r] !== MISSING) (p.wb += wb[r]), p.wbN++;
      if (eb[r] !== MISSING) (p.eb += eb[r]), p.ebN++;
      return p;
    },
    (p: HourReduce, r: number) => {
      if (wb[r] !== MISSING) (p.wb -= wb[r]), p.wbN--;
      if (eb[r] !== MISSING) (p.eb -= eb[r]), p.ebN--;
      return p;
    },
    () => ({ wb: 0, eb: 0, wbN: 0, ebN: 0 }),
  );

  // closure * 2 + incomplete, filtered by the two toggles.
  const qualityDim = cf.dimension((r: number) => {
    const d = (r / 24) | 0;
    return days.closure[d] * 2 + (days.complete[d] ? 0 : 1);
  });
  const dayDim = cf.dimension((r: number) => (r / 24) | 0);
  const dayGroup = dayDim.group().reduceCount();

  const applyBins = (id: FilterId) => {
    const sel = filters!.bins[id];
    const { dim } = dims.get(id)!;
    if (sel) dim.filterFunction((k) => sel.has(k as number));
    else dim.filterAll();
  };

  const baselineFor = (f: Filters): (number | null)[] => {
    const src = dir === "wb" ? wb : eb;
    const sum = new Float64Array(24);
    const cnt = new Uint32Array(24);
    for (let d = 0; d < n; d++) {
      if (!f.includeClosures && days.closure[d]) continue;
      if (!f.includeIncomplete && !days.complete[d]) continue;
      for (let h = 0; h < 24; h++) {
        const v = src[d * 24 + h];
        if (v !== MISSING) (sum[h] += v), cnt[h]++;
      }
    }
    return Array.from(sum, (s, h) => (cnt[h] ? s / cnt[h] : null));
  };
  let baseline: (number | null)[] = [];

  const read = (): Omit<Snapshot, "baseline" | "ms"> => {
    const bars = {} as Record<FilterId, BinValue[]>;
    for (const spec of specs) {
      const out: BinValue[] = spec.labels.map(() => ({ value: 0, days: 0 }));
      for (const { key, value } of dims.get(spec.id)!.group.all()) {
        const k = key as number;
        if (k < 0 || k >= out.length) continue;
        const sum = dir === "wb" ? value.wb : value.eb;
        out[k] = {
          days: value.nDays,
          value: spec.measure === "avg" ? (value.nDays ? sum / value.nDays : 0) : value.nDays,
        };
      }
      bars[spec.id] = out;
    }

    const hero: (number | null)[] = new Array(24).fill(null);
    for (const { key, value } of hourGroup.all()) {
      const s = dir === "wb" ? value.wb : value.eb;
      const c = dir === "wb" ? value.wbN : value.ebN;
      hero[key as number] = c ? s / c : null;
    }

    const matched = new Uint8Array(n);
    let nMatched = 0;
    for (const { key, value } of dayGroup.all()) {
      if ((value as number) > 0) (matched[key as number] = 1), nMatched++;
    }

    const totals = dir === "wb" ? days.wbTotal : days.ebTotal;
    const top: number[] = [];
    for (let d = 0; d < n; d++) {
      const t = totals[d];
      if (!matched[d] || t == null) continue;
      if (top.length < TOP_N || t > totals[top[top.length - 1]]!) {
        top.push(d);
        top.sort((a, b) => totals[b]! - totals[a]!);
        if (top.length > TOP_N) top.pop();
      }
    }
    return { bars, hero, matched, nMatched, top };
  };

  /** Apply the filters (diffing against the last ones) and read every group. */
  const update = (next: Filters, nextDir: Direction): Snapshot => {
    const t0 = performance.now();
    const prev = filters;
    filters = next;
    const dirChanged = nextDir !== dir;
    if (dirChanged) {
      dir = nextDir;
      for (const spec of specs) {
        if (!spec.directional) continue;
        const old = dims.get(spec.id)!;
        old.group.dispose();
        old.dim.dispose();
        buildDim(spec);
        applyBins(spec.id);
      }
    }
    for (const spec of specs) {
      if (!prev || prev.bins[spec.id] !== next.bins[spec.id]) applyBins(spec.id);
    }
    if (!prev || prev.hours !== next.hours) {
      if (next.hours) hourDim.filterRange([next.hours[0], next.hours[1] + 1]);
      else hourDim.filterAll();
    }
    const qualityChanged =
      !prev || prev.includeClosures !== next.includeClosures || prev.includeIncomplete !== next.includeIncomplete;
    if (qualityChanged) {
      qualityDim.filterFunction((k) => {
        const q = k as number;
        if (!next.includeClosures && q >= 2) return false;
        if (!next.includeIncomplete && q % 2 === 1) return false;
        return true;
      });
    }
    if (qualityChanged || dirChanged) baseline = baselineFor(next);
    const snap = read();
    return { ...snap, baseline, ms: performance.now() - t0 };
  };

  return { update };
};

export type Engine = ReturnType<typeof createEngine>;
