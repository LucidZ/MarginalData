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
        <h1>The Smoke Is Getting Worse. The Data Agrees.</h1>
        <p>
          I live in Colorado, and it feels like every summer brings more hazy, smoke-tinted days
          than the last. Curious whether that was real or just memory, I found a 2023 paper in{" "}
          <a
            href="https://www.nature.com/articles/s41586-023-06522-6"
            target="_blank"
            rel="noreferrer"
          >
            Nature
          </a>{" "}
          that had already mapped it: what people actually breathed, state by state, against an
          estimate of what they'd have breathed in a world without wildfire smoke. I rebuilt it as
          something you can click through yourself, on my own EPA AQS pull joined against
          Stanford's newer{" "}
          <a
            href="https://github.com/echolab-stanford/smokePM-version1.1"
            target="_blank"
            rel="noreferrer"
          >
            smokePM-version1.1
          </a>{" "}
          county-day smoke data, and extended it a few years past where the original data
          stopped.
        </p>
        <p>
          Every tile is one state, {data.startYear ?? 2006}–{data.extendedThroughYear ?? 2025}. The
          counterfactual line stops at {data.smokeDataThroughYear} where the smoke data currently
          ends; the observed line continues past that on EPA monitoring alone. Click a tile to
          open it full size.
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
          Tile color is my own read, not the original paper's: each state's share of 2016–2023
          average PM2.5 attributable to smoke (observed minus counterfactual, as a percent of
          observed), split at a plain 10%/15% rather than the paper's statistical bands. Recent
          years only, not the full 2006–2023 record — a longer average buries states with a calm
          early history and a severe recent one (WA is the clearest case) under a quieter long-run
          number.
        </p>
        <p>
          The "days per year &gt; 35 µg/m³" chart stops at 2022 on purpose. EPA's own count of
          exceedance days disagrees with the original study's by roughly 30–50% for the years both
          cover, so stitching newer years on would look like a real drop when it's really just a
          different way of counting. Its tile tint uses the same idea as the chart above but ranks
          by raw smoke-attributable days/year, not a % share — most states have close to zero
          exceedance days most years, so a % share here would be dominated by tiny denominators
          rather than a real signal.
        </p>
      </footer>
    </div>
  );
}
