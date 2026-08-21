import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useData } from "./useData";
import MetricGrid from "./MetricGrid";
import type { HoverInfo } from "./MetricGrid";
import DetailPanel from "./DetailPanel";
import Tooltip from "./Tooltip";
import type { Metric, StateTrend } from "./types";
import "./App.css";

interface Selection {
  abbr: string;
  metric: Metric;
}

function morphTo(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => flushSync(fn));
  } else {
    fn();
  }
}

export default function App() {
  const { data, error } = useData();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // Both metrics are their own grid, shown at once, rather than one grid
  // behind a metric toggle — the two aren't really alternate views of the
  // same thing, they're different questions ("how polluted" vs. "how often
  // extreme"), so showing both by default beats hiding one behind a click.
  const selectedState = useMemo(
    () => (selected ? (data?.states.find((s) => s.abbr === selected.abbr) ?? null) : null),
    [data, selected]
  );

  function handleHover(state: StateTrend, metric: Metric, yearIndex: number | null, clientX: number, clientY: number) {
    setHover(yearIndex === null ? null : { state, metric, yearIndex, clientX, clientY });
  }

  function handleSelect(state: StateTrend, metric: Metric) {
    setHover(null);
    morphTo(() => setSelected({ abbr: state.abbr, metric }));
  }

  if (error) {
    return <div className="wst-root wst-loading">Couldn&apos;t load state trends: {error.message}</div>;
  }

  if (!data) {
    return <div className="wst-root wst-loading">Loading state trends…</div>;
  }

  return (
    <div className="wst-root">
      <header className="wst-header">
        <h1>Wildfire Smoke &amp; the US PM2.5 Trend Reversal</h1>
        <p>
          Living in Colorado, I've noticed smoky air more and more often in the summer, and went
          looking for whether that's a real trend or just my imagination. That search turned up a
          geofaceted small-multiples map — a little line chart for every state, arranged in the
          rough shape of the country — from{" "}
          <a
            href="https://www.nature.com/articles/s41586-023-06522-6"
            target="_blank"
            rel="noreferrer"
          >
            Burke et al. 2023, <em>Nature</em>
          </a>
          . Their paper compares observed PM2.5 (black) — fine particulate pollution small enough
          to get deep into your lungs and bloodstream — against a counterfactual (blue) estimating
          what it would have been without wildfire smoke. A paper has to publish as a static
          image, so it couldn't take advantage of what a website can do; I recreated it here,
          interactive, rebuilt end-to-end on my own EPA AQS pull joined against the Stanford lab's
          newer{" "}
          <a
            href="https://github.com/echolab-stanford/smokePM-version1.1"
            target="_blank"
            rel="noreferrer"
          >
            smokePM-version1.1
          </a>{" "}
          county-day smoke data — one consistent pipeline across the whole span, rather than
          splicing the two papers' own precomputed numbers together — with my own simplified
          color-coding on top (the why's in the notes below).
        </p>
        <p>
          Every state's annual trend, {data.startYear ?? 2006}–{data.extendedThroughYear ?? 2025}.
          The counterfactual line stops at {data.smokeDataThroughYear} where the underlying smoke
          data currently ends; the observed line continues past that using EPA monitoring data
          directly.
        </p>
      </header>

      {selectedState && selected ? (
        <DetailPanel
          state={selectedState}
          metric={selected.metric}
          hoveredYearIndex={
            hover?.state.abbr === selectedState.abbr && hover.metric === selected.metric ? hover.yearIndex : null
          }
          onHover={(state, yearIndex, clientX, clientY) => handleHover(state, selected.metric, yearIndex, clientX, clientY)}
          onBack={() => {
            setHover(null);
            morphTo(() => setSelected(null));
          }}
        />
      ) : (
        <>
          <MetricGrid
            data={data}
            metric="mean"
            title="Annual average PM2.5"
            hover={hover}
            onHover={handleHover}
            onSelect={handleSelect}
          />
          <MetricGrid
            data={data}
            metric="extreme"
            title="Days per year > 35 µg/m³"
            hover={hover}
            onHover={handleHover}
            onSelect={handleSelect}
          />
        </>
      )}

      {hover && (
        <Tooltip
          state={hover.state}
          yearIndex={hover.yearIndex}
          metric={hover.metric}
          clientX={hover.clientX}
          clientY={hover.clientY}
        />
      )}

      <footer className="wst-footer">
        <p>
          Annual-average lines follow the paper's own convention (unweighted station-year
          averages) but are computed on our own data, not the paper's precomputed numbers — see
          the note above. The colored tile tint above is our own simplified read, not the paper's
          statistical reversal/stagnation classification: states are ranked by what share of
          their 2016–2023 average PM2.5 is attributable to wildfire smoke (observed minus
          counterfactual, as a percent of observed), tiered at a plain 10%/15% split rather than
          the paper's statistical bands. Recent years only, not the full 2006–2023 record — a
          longer average buries states with a calm early history and a severe recent one (WA is
          the clearest case) under a quieter long-run number.
        </p>
        <p>
          The "days per year &gt; 35 µg/m³" chart is still capped at the original study's
          2000–2022 data for both lines, unlike the chart above — EPA does publish a usable
          exceedance-day count we could extend the observed line with on its own, but checked
          against the original study's own numbers for the years both cover, it disagrees by a
          lot (roughly 30–50% lower), so appending it past 2022 would likely read as a real drop
          when it's actually just a different counting method taking over. Its tile tint uses the
          same idea and the same 2016–2022 window as the chart above, but ranked by raw
          smoke-attributable days/year rather than a % share — most states have close to zero
          exceedance days most years, so a % share here is dominated by tiny denominators rather
          than a real signal.
        </p>
      </footer>
    </div>
  );
}
