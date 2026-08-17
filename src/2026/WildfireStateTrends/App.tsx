import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useData } from "./useData";
import StateTile from "./StateTile";
import DetailPanel from "./DetailPanel";
import Tooltip from "./Tooltip";
import { computeGlobalYDomain } from "./chartGeometry";
import type { Metric, StateTrend } from "./types";
import "./App.css";

interface HoverInfo {
  state: StateTrend;
  yearIndex: number;
  clientX: number;
  clientY: number;
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
  const data = useData();
  const [metric, setMetric] = useState<Metric>("mean");
  const [selectedAbbr, setSelectedAbbr] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [standardizeY, setStandardizeY] = useState(false);

  const selected = useMemo(
    () => data?.states.find((s) => s.abbr === selectedAbbr) ?? null,
    [data, selectedAbbr]
  );

  const breakYear = data ? (metric === "mean" ? data.meanBreakYear : data.extremeBreakYear) : 0;

  // Free per-tile scales (default) make each state's own shape legible
  // regardless of its magnitude, matching the paper's own figures.
  // Standardized scales trade that away so tiles are directly comparable —
  // most non-Western states will flatten out, which is the point.
  const sharedYDomain = useMemo(
    () => (data && standardizeY ? computeGlobalYDomain(data.states, metric) : null),
    [data, standardizeY, metric]
  );

  function handleHover(state: StateTrend, yearIndex: number | null, clientX: number, clientY: number) {
    setHover(yearIndex === null ? null : { state, yearIndex, clientX, clientY });
  }

  if (!data) {
    return <div className="wst-root wst-loading">Loading state trends…</div>;
  }

  return (
    <div className="wst-root">
      <header className="wst-header">
        <h1>Wildfire Smoke &amp; the US PM2.5 Trend Reversal</h1>
        <p>
          Every state's annual air-quality trend, {data.startYear ?? 2006}–{data.extendedThroughYear ?? 2025} —
          observed PM2.5 (black) against a counterfactual estimate of what it would have been without
          wildfire smoke (blue). Methodology follows{" "}
          <a
            href="https://www.nature.com/articles/s41586-023-06522-6"
            target="_blank"
            rel="noreferrer"
          >
            Burke et al. 2023, <em>Nature</em>
          </a>
          , rebuilt on our own EPA AQS pull joined against the Stanford lab's newer{" "}
          <a
            href="https://github.com/echolab-stanford/smokePM-version1.1"
            target="_blank"
            rel="noreferrer"
          >
            smokePM-version1.1
          </a>{" "}
          county-day smoke data — one consistent pipeline across the whole span, rather than
          splicing the two papers' own precomputed numbers together. The counterfactual line stops
          at {data.smokeDataThroughYear} where that smoke data currently ends; the observed line
          continues using EPA monitoring data directly.
        </p>
      </header>

      <div className="wst-controls">
        <div className="wst-toggle" role="group" aria-label="Metric">
          <button
            type="button"
            className={metric === "mean" ? "wst-toggle__btn wst-toggle__btn--active" : "wst-toggle__btn"}
            onClick={() => {
              setMetric("mean");
              setHover(null);
            }}
          >
            Annual average PM2.5
          </button>
          <button
            type="button"
            className={metric === "extreme" ? "wst-toggle__btn wst-toggle__btn--active" : "wst-toggle__btn"}
            onClick={() => {
              setMetric("extreme");
              setHover(null);
            }}
          >
            % days &gt; 35 µg/m³
          </button>
        </div>

        {!selected && (
          <label className="wst-axis-toggle">
            <input
              type="checkbox"
              checked={standardizeY}
              onChange={(e) => setStandardizeY(e.target.checked)}
            />
            Standardize y-axis across states
          </label>
        )}
      </div>

      {selected ? (
        <DetailPanel
          state={selected}
          metric={metric}
          breakYear={breakYear}
          hoveredYearIndex={hover?.state.abbr === selected.abbr ? hover.yearIndex : null}
          onHover={handleHover}
          onBack={() => {
            setHover(null);
            morphTo(() => setSelectedAbbr(null));
          }}
        />
      ) : (
        <div className="wst-grid-scroll">
          <div className="wst-grid">
            {data.states.map((s) => (
              <StateTile
                key={s.abbr}
                state={s}
                metric={metric}
                breakYear={breakYear}
                isSelected={false}
                hoveredYearIndex={hover?.state.abbr === s.abbr ? hover.yearIndex : null}
                sharedYDomain={sharedYDomain}
                onHover={handleHover}
                onSelect={(state) => {
                  setHover(null);
                  morphTo(() => setSelectedAbbr(state.abbr));
                }}
              />
            ))}
          </div>
        </div>
      )}

      {hover && <Tooltip state={hover.state} yearIndex={hover.yearIndex} metric={metric} clientX={hover.clientX} clientY={hover.clientY} />}

      <footer className="wst-footer">
        <p>
          Annual-average lines follow the paper's own convention (unweighted station-year
          averages) but are computed on our own data, not the paper's precomputed numbers — see
          the note above. The colored severity classification, however, is still the original
          2000–2022 bootstrap result carried over unchanged; it hasn't been recomputed against
          this rebuilt series yet, so treat it as an approximate, not-yet-updated read on states
          near a category boundary.
        </p>
      </footer>
    </div>
  );
}
