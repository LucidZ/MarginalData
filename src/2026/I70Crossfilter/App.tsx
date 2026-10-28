import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "./useData";
import { buildBins, describeBins } from "./bins";
import { createEngine, type Engine } from "./engine";
import { MAX_CAT, buildGroupings, groupCurves } from "./compare";
import { buildPresets, type Preset } from "./presetList";
import type { BinSpec, CounterId, Dataset, Direction, FilterId, Filters, Selection, Series, Snapshot } from "./types";
import Controls from "./Controls";
import Presets from "./Presets";
import CompareControl from "./CompareControl";
import HourChart from "./HourChart";
import SeriesTable from "./SeriesTable";
import BarFilter from "./BarFilter";
import CalendarStrip from "./CalendarStrip";
import TopDays from "./TopDays";
import { fmtInt } from "./format";
import "./App.css";

const EMPTY_BINS: Record<FilterId, Selection> = {
  dow: null,
  month: null,
  year: null,
  holiday: null,
  snowOvernight: null,
  snowDay: null,
  precipDay: null,
  total: null,
};

const INITIAL: Filters = { bins: EMPTY_BINS, hours: null, includeClosures: false, includeIncomplete: false };

declare global {
  interface Window {
    __i70x?: { ms: number; nMatched: number; bars: Snapshot["bars"] };
  }
}

const I70Crossfilter = () => {
  const { data: sets, error } = useData();
  const [counter, setCounter] = useState<CounterId>("tunnel");
  const data = sets?.find((s) => s.days.id === counter) ?? null;
  // One engine per counter, built the first time it's shown and kept, so
  // switching back is instant. Each engine diffs against its own last filters.
  const built = useMemo(() => new Map<Dataset, { specs: BinSpec[]; engine: Engine }>(), [sets]);
  const build = useCallback(
    (d: Dataset) => {
      let b = built.get(d);
      if (!b) {
        const specs = buildBins(d);
        b = { specs, engine: createEngine(d, specs) };
        built.set(d, b);
      }
      return b;
    },
    [built],
  );
  const { specs, engine } = useMemo(() => (data ? build(data) : { specs: [], engine: null }), [build, data]);
  // Build the other counters' engines once the page is idle, so the first
  // switch doesn't stall on it.
  useEffect(() => {
    if (!sets) return;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    let k = 0;
    const next = () => {
      if (k >= sets.length) return;
      build(sets[k++]);
      idle(next);
    };
    idle(next);
  }, [sets, build]);
  const groupings = useMemo(() => (data ? buildGroupings(data) : []), [data]);
  const presets = useMemo(() => (data ? buildPresets(data) : []), [data]);
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [dir, setDir] = useState<Direction>("wb");
  // The filter charts scope the days; "compare by" splits them into lines.
  const [compare, setCompare] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  // Cleared by any manual change, so a chip only lights up while it's true.
  const [preset, setPreset] = useState<string | null>(null);

  const snap = useMemo(() => (engine ? engine.update(filters, dir) : null), [engine, filters, dir]);
  const grouping = groupings.find((g) => g.id === compare) ?? null;
  const anyBin = Object.values(filters.bins).some((s) => s != null);

  // Days passing the closure / incomplete toggles: what "all days" means.
  const nQuality = useMemo(() => {
    if (!data) return 0;
    let k = 0;
    for (let d = 0; d < data.n; d++) {
      if (!filters.includeClosures && data.days.closure[d]) continue;
      if (!filters.includeIncomplete && !data.days.complete[d]) continue;
      k++;
    }
    return k;
  }, [data, filters.includeClosures, filters.includeIncomplete]);

  const series = useMemo((): Series[] => {
    if (!data || !snap) return [];
    const matching: Series = {
      key: "matching",
      label: grouping ? "All matching days" : "Matching days",
      curve: snap.hero,
      nDays: snap.nMatched,
      style: "main",
      tone: 0,
    };
    if (!grouping) {
      if (!anyBin) return [matching];
      return [{ key: "all", label: "All days", curve: snap.baseline, nDays: nQuality, style: "ref", tone: 0 }, matching];
    }
    const curves = groupCurves(data, snap.matched, dir, grouping.groupOf, grouping.labels.length);
    const groups = grouping.labels
      .map((label, g) => ({ key: `g${g}`, label, ...curves[g], g }))
      .filter((s) => s.nDays > 0);
    if (grouping.kind === "ab") {
      // The first group is the reference the second is measured against.
      return groups.map((s, i) => ({
        ...s,
        style: groups.length === 2 && i === 0 ? ("ref" as const) : ("main" as const),
        tone: 0,
      }));
    }
    const last = Math.max(1, grouping.labels.length - 1);
    // Hues follow the group, not its rank, so filtering a group out doesn't repaint the rest.
    const cat = grouping.kind === "nominal" && grouping.labels.length <= MAX_CAT;
    return [
      { ...matching, style: "ref" as const },
      ...groups.map((s) => ({
        ...s,
        style: grouping.kind === "ordinal" ? ("ramp" as const) : cat ? ("cat" as const) : ("faint" as const),
        tone: cat ? s.g : s.g / last,
      })),
    ];
  }, [data, snap, grouping, anyBin, dir, nQuality]);

  // Exposed for the smoke test (filter timing, day counts).
  useEffect(() => {
    if (snap) window.__i70x = { ms: snap.ms, nMatched: snap.nMatched, bars: snap.bars };
  }, [snap]);

  const setBins = useCallback((id: FilterId, sel: Selection) => {
    setPreset(null);
    setFilters((f) => ({ ...f, bins: { ...f.bins, [id]: sel } }));
  }, []);
  const changeDir = (d: Direction) => {
    // The daily-total bins mean different things per direction.
    setFilters((f) => ({ ...f, bins: { ...f.bins, total: null } }));
    setDir(d);
  };
  // Everything else carries over: the same days, counted somewhere else.
  const changeCounter = (c: CounterId) => {
    setFilters((f) => ({ ...f, bins: { ...f.bins, total: null } }));
    setHighlight(null);
    setCounter(c);
  };
  const changeCompare = (id: string | null) => {
    setPreset(null);
    setHighlight(null);
    setCompare(id);
  };
  const pickPreset = (p: Preset) => {
    setFilters((f) => ({ ...f, bins: { ...EMPTY_BINS, ...p.bins }, hours: null }));
    setCompare(p.compare);
    setHighlight(null);
    setPreset(p.id);
  };

  const anyFilter = filters.hours != null || anyBin || compare != null;
  const scope = anyBin ? describeBins(specs, filters.bins) : "All days";

  return (
    <div className={`i70x-root ${dir}`}>
      <header className="i70x-header">
        <h1>{data?.days.title ?? "Every hour through the Eisenhower Tunnel"}</h1>
        <p className="i70x-intro">
          CDOT has counted the cars going each way through the Eisenhower-Johnson Memorial Tunnel on I-70 every hour since
          1996, and on US-40 below Berthoud Pass, the road to Winter Park that never goes through the tunnel. Pick any
          kind of day (Saturdays in February, holiday Mondays, the morning after a foot of snow) with the
          filter charts, then use <em>Compare by</em> to split those days into groups: snow vs none, weekends vs
          weekdays, one line per year. Every other chart updates to show only the matching days. Switch counters to see
          the same days somewhere else.
        </p>
      </header>

      {error && <p className="i70x-error">Couldn't load the data: {error.message}</p>}
      {!snap || !data ? (
        !error && <p className="i70x-loading">Loading 30 years of hourly counts...</p>
      ) : (
        <>
          <Presets presets={presets} active={preset} onPick={pickPreset} />
          <Controls
            counters={sets!.map((s) => ({ id: s.days.id, name: s.days.name }))}
            counter={counter}
            onCounter={changeCounter}
            dir={dir}
            onDir={changeDir}
            includeClosures={filters.includeClosures}
            onClosures={(v) => setFilters((f) => ({ ...f, includeClosures: v }))}
            includeIncomplete={filters.includeIncomplete}
            onIncomplete={(v) => setFilters((f) => ({ ...f, includeIncomplete: v }))}
            anyFilter={anyFilter}
            onReset={() => {
              setFilters((f) => ({ ...f, bins: EMPTY_BINS, hours: null }));
              changeCompare(null);
            }}
          />

          <section className="i70x-hero">
            <div className="i70x-count">
              <span className="i70x-count-n">{fmtInt(snap.nMatched)}</span>
              <span className="i70x-count-label">
                days match{" "}
                <br />
                of {fmtInt(data.n)}
              </span>
            </div>
            <div className="i70x-hero-main">
              <div className="i70x-hero-head">
                <p className="i70x-scope">
                  <span>Days:</span> {scope}
                </p>
                <CompareControl groupings={groupings} value={compare} onChange={changeCompare} />
              </div>
              <HourChart
                series={series}
                highlight={highlight}
                onHighlight={setHighlight}
                dir={dir}
                hours={filters.hours}
                onHours={(h) => {
                  setPreset(null);
                  setFilters((f) => ({ ...f, hours: h }));
                }}
              />
              <SeriesTable
                series={series}
                counter={counter}
                dir={dir}
                hours={filters.hours}
                highlight={highlight}
                onHighlight={setHighlight}
              />
            </div>
          </section>

          <section className="i70x-filters">
            {specs.map((spec) => (
              <BarFilter
                key={spec.id}
                spec={spec}
                bins={snap.bars[spec.id]}
                ghost={snap.ref[dir][spec.id]}
                domainMax={Math.max(...snap.ref.wb[spec.id].map((b) => b.value), ...snap.ref.eb[spec.id].map((b) => b.value))}
                selection={filters.bins[spec.id]}
                onChange={(sel) => setBins(spec.id, sel)}
              />
            ))}
          </section>

          <CalendarStrip data={data} matched={snap.matched} dir={dir} />
          <TopDays data={data} top={snap.top} dir={dir} />

          <section className="i70x-notes">
            <h2>What you're looking at</h2>
            <p>
              <strong>Counts, not speeds.</strong> The counter records how many vehicles pass each hour, by direction.
              A low count can mean an empty road or a jammed one.
            </p>
            <p>
              <strong>Filters vs Compare by.</strong> The filter charts decide which days count. Compare by splits those
              days into groups, so each group shares everything else you picked: "snow vs none" on winter weekends
              compares snowy winter weekends with clear winter weekends, not with every day. Groups can still differ in
              ways you didn't filter on (snowy days may cluster in some years), so keep the scope tight.
            </p>
            <p>
              <strong>Two counters.</strong> The Eisenhower Tunnel counter carries I-70 traffic to Summit County and
              beyond. The Berthoud Pass counter sits on US-40 between Empire and the pass, so it catches everyone driving
              from Denver to Winter Park and Grand County. Nobody is counted twice: Winter Park traffic never reaches
              the tunnel. Westbound on I-70 and northbound on US-40 are both the direction away from Denver, so they
              share a color. The filters pick days, not counts, so switching counters keeps them (except the daily
              total). Each counter has its own missing hours and closures, so the number of matching days can change.
            </p>
            <p>
              <strong>Overnight vs daytime snow.</strong> Weather is the NOAA daily report from Dillon (Georgetown when
              Dillon is missing). It is read at about 8 AM, so "overnight" is that morning's report and "during the day"
              is the next morning's. Both counters use the same report. For Berthoud it's a stand-in: Dillon is
              about 25 miles from Winter Park, and storms don't always hit both.
            </p>
            <p>
              <strong>Missing hours and closures.</strong> Days with any missing hour, and days where a midday hour fell
              under 5% of normal (a likely closure), are left out unless you include them above. {data.days.partialYear}{" "}
              runs through {data.days.end} only (marked *). Averages are per matching day, so a month with more days
              doesn't look busier.
            </p>
            <p className="i70x-source">
              Data: CDOT OTIS traffic counts (stations 000106 and 000223), NOAA GHCN-Daily.
            </p>
          </section>
        </>
      )}
    </div>
  );
};

export default I70Crossfilter;
