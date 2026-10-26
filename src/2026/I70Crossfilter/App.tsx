import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "./useData";
import { buildBins } from "./bins";
import { createEngine } from "./engine";
import type { Direction, FilterId, Filters, Selection, Snapshot } from "./types";
import Controls from "./Controls";
import HourChart from "./HourChart";
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
  snowDepth: null,
  total: null,
  saturated: null,
};

const INITIAL: Filters = { bins: EMPTY_BINS, hours: null, includeClosures: false, includeIncomplete: false };

declare global {
  interface Window {
    __i70x?: { ms: number; nMatched: number; bars: Snapshot["bars"] };
  }
}

const I70Crossfilter = () => {
  const { data, error } = useData();
  const specs = useMemo(() => (data ? buildBins(data) : []), [data]);
  const engine = useMemo(() => (data ? createEngine(data, specs) : null), [data, specs]);
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [dir, setDir] = useState<Direction>("wb");

  const snap = useMemo(() => (engine ? engine.update(filters, dir) : null), [engine, filters, dir]);

  // Exposed for the smoke test (filter timing, day counts).
  useEffect(() => {
    if (snap) window.__i70x = { ms: snap.ms, nMatched: snap.nMatched, bars: snap.bars };
  }, [snap]);

  const setBins = useCallback(
    (id: FilterId, sel: Selection) => setFilters((f) => ({ ...f, bins: { ...f.bins, [id]: sel } })),
    [],
  );
  const changeDir = (d: Direction) => {
    // The daily-total and saturated-hours bins mean different things per direction.
    setFilters((f) => ({ ...f, bins: { ...f.bins, total: null, saturated: null } }));
    setDir(d);
  };

  const anyFilter = filters.hours != null || Object.values(filters.bins).some((s) => s != null);

  return (
    <div className={`i70x-root ${dir}`}>
      <header className="i70x-header">
        <h1>Every hour through the Eisenhower Tunnel</h1>
        <p className="i70x-intro">
          CDOT has counted the cars going each way through the Eisenhower-Johnson Memorial Tunnel on I-70 every hour since
          1996. Pick any kind of day (Saturdays in February, holiday Mondays, the morning after a foot of snow) and see what
          an hour of tunnel traffic looks like on those days next to a typical day. Click or drag on any chart to filter;
          every other chart updates to show only the matching days.
        </p>
      </header>

      {error && <p className="i70x-error">Couldn't load the data: {error.message}</p>}
      {!snap || !data ? (
        !error && <p className="i70x-loading">Loading 30 years of hourly counts...</p>
      ) : (
        <>
          <Controls
            dir={dir}
            onDir={changeDir}
            includeClosures={filters.includeClosures}
            onClosures={(v) => setFilters((f) => ({ ...f, includeClosures: v }))}
            includeIncomplete={filters.includeIncomplete}
            onIncomplete={(v) => setFilters((f) => ({ ...f, includeIncomplete: v }))}
            anyFilter={anyFilter}
            onReset={() => setFilters((f) => ({ ...f, bins: EMPTY_BINS, hours: null }))}
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
            <HourChart
              hero={snap.hero}
              baseline={snap.baseline}
              dir={dir}
              hours={filters.hours}
              onHours={(h) => setFilters((f) => ({ ...f, hours: h }))}
            />
          </section>

          <section className="i70x-filters">
            {specs.map((spec) => (
              <BarFilter
                key={spec.id}
                spec={spec}
                bins={snap.bars[spec.id]}
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
              A low count can mean an empty road or a jammed one. Hours near capacity (90% of that year's 99.5th
              percentile hour) are the clearest jam signal a single counter gives.
            </p>
            <p>
              <strong>Overnight vs daytime snow.</strong> Weather is the NOAA daily report from Dillon (Georgetown when
              Dillon is missing). It is read at about 8 AM, so "overnight" is that morning's report and "during the day"
              is the next morning's.
            </p>
            <p>
              <strong>Missing hours and closures.</strong> Days with any missing hour, and days where a midday hour fell
              under 5% of normal (a likely closure), are left out unless you include them above. {data.days.partialYear}{" "}
              runs through {data.days.end} only (marked *). Averages are per matching day, so a month with more days
              doesn't look busier.
            </p>
            <p className="i70x-source">
              Data: CDOT OTIS traffic counts (station 000106), NOAA GHCN-Daily.
            </p>
          </section>
        </>
      )}
    </div>
  );
};

export default I70Crossfilter;
