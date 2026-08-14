import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useData } from "./useData";
import StateTile from "./StateTile";
import DetailPanel from "./DetailPanel";
import CompareView from "./CompareView";
import Tooltip from "./Tooltip";
import type { Metric, StateTrend } from "./types";
import "./App.css";

interface HoverInfo {
  state: StateTrend;
  yearIndex: number;
  clientX: number;
  clientY: number;
}

const MAX_COMPARE = 8;
const CAT_VARS = [
  "var(--cat-1)",
  "var(--cat-2)",
  "var(--cat-3)",
  "var(--cat-4)",
  "var(--cat-5)",
  "var(--cat-6)",
  "var(--cat-7)",
  "var(--cat-8)",
];

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
  // Ordered, not a Set — selection order assigns the fixed categorical
  // color slots (1st pick = slot 1, etc.), never re-cycled or resorted.
  const [compareAbbrs, setCompareAbbrs] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const selected = useMemo(
    () => data?.states.find((s) => s.abbr === selectedAbbr) ?? null,
    [data, selectedAbbr]
  );

  const compareStates = useMemo(
    () => compareAbbrs.map((a) => data?.states.find((s) => s.abbr === a)).filter((s): s is StateTrend => !!s),
    [data, compareAbbrs]
  );
  const compareColors = useMemo(
    () => Object.fromEntries(compareAbbrs.map((abbr, i) => [abbr, CAT_VARS[i % CAT_VARS.length]])),
    [compareAbbrs]
  );

  const breakYear = data ? (metric === "mean" ? data.meanBreakYear : data.extremeBreakYear) : 0;

  function handleHover(state: StateTrend, yearIndex: number | null, clientX: number, clientY: number) {
    setHover(yearIndex === null ? null : { state, yearIndex, clientX, clientY });
  }

  function toggleCompare(abbr: string) {
    setCompareAbbrs((prev) => {
      if (prev.includes(abbr)) return prev.filter((a) => a !== abbr);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, abbr];
    });
  }

  if (!data) {
    return <div className="wst-root wst-loading">Loading state trends…</div>;
  }

  return (
    <div className="wst-root">
      <header className="wst-header">
        <h1>Wildfire Smoke &amp; the US PM2.5 Trend Reversal</h1>
        <p>
          Every state's annual air-quality trend, 2000–2022 — observed PM2.5 (black) against a
          counterfactual estimate of what it would have been without wildfire smoke (blue).
          Reproduced from{" "}
          <a
            href="https://www.nature.com/articles/s41586-023-06522-6"
            target="_blank"
            rel="noreferrer"
          >
            Burke et al. 2023, <em>Nature</em>
          </a>
          .
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
      </div>

      {compareOpen ? (
        <CompareView
          states={compareStates}
          colors={compareColors}
          metric={metric}
          onBack={() => morphTo(() => setCompareOpen(false))}
          onRemove={(abbr) => setCompareAbbrs((prev) => prev.filter((a) => a !== abbr))}
        />
      ) : selected ? (
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
                compareColor={compareAbbrs.includes(s.abbr) ? compareColors[s.abbr] : null}
                compareDisabled={compareAbbrs.length >= MAX_COMPARE}
                onHover={handleHover}
                onSelect={(state) => {
                  setHover(null);
                  morphTo(() => setSelectedAbbr(state.abbr));
                }}
                onToggleCompare={toggleCompare}
              />
            ))}
          </div>
        </div>
      )}

      {hover && <Tooltip state={hover.state} yearIndex={hover.yearIndex} metric={metric} clientX={hover.clientX} clientY={hover.clientY} />}

      {!compareOpen && !selected && compareAbbrs.length > 0 && (
        <div className="wst-compare-cta">
          {compareAbbrs.length >= 2 ? (
            <button type="button" onClick={() => morphTo(() => setCompareOpen(true))}>
              Compare {compareAbbrs.length} states →
            </button>
          ) : (
            <span>Pick one more state to compare</span>
          )}
          <button type="button" className="wst-compare-cta__clear" onClick={() => setCompareAbbrs([])}>
            Clear
          </button>
        </div>
      )}

      <footer className="wst-footer">
        <p>
          Lines reproduce the paper's own published methodology exactly (unweighted station-year
          averages). The colored severity classification is independently re-derived from the
          authors' bootstrap replication data and closely — but not pixel-for-pixel — matches the
          published figure; treat category assignment as approximate for a handful of borderline
          states.
        </p>
      </footer>
    </div>
  );
}
