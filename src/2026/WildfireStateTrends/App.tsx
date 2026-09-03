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
          than the last. Curious whether that was real or just my imagination, I found a 2023
          paper in{" "}
          <a
            href="https://www.nature.com/articles/s41586-023-06522-6"
            target="_blank"
            rel="noreferrer"
          >
            Nature
          </a>{" "}
          that had already showed it: state-by-state PM2.5 against an estimate of what it would've
          been without wildfire smoke (in blue), identified from satellite imagery of the plumes
          themselves. I rebuilt it here and extended it to some more recent data.
        </p>
        <p>
          I think it's interesting to see the shift in the Pacific Northwest around 2016. So,
          definitely not just my imagination!
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
        <details className="wst-details">
          <summary>Data &amp; methodology</summary>
          <p>
            The tile tint above uses a plain 10%/15% split rather than the original paper's own
            statistical bands, and covers 2016–2023 rather than the full 2006–2023 record: a
            longer average buries states with a calm early history and a severe recent one (WA is
            the clearest case) under a quieter long-run number. The extreme-days chart's tint
            ranks by raw days instead of a % share because most states have close to zero
            exceedance days most years, so a % share there would be dominated by tiny denominators
            rather than a real signal.
          </p>
          <p>
            The extreme-days chart itself stays capped at 2022 because EPA's own count of
            exceedance days disagrees with the original study's by roughly 30–50% for the years
            both cover, so stitching newer years on would look like a real drop when it's really
            just a different way of counting.
          </p>
          <p>
            Every tile is one state; click one to open it full size. Every state also gets the
            same size tile no matter its population or land area, so Wyoming (~580,000 people)
            gets exactly as much visual space as California (~39 million). The tradeoff is true
            geography: squeezing 48 states into a clean rectangle means real neighbors don't
            always end up next to each other. New York and Pennsylvania
            share one of the longest state borders in the country, but here they sit diagonal to
            each other, not edge to edge. A few states (Maine, Vermont, New Hampshire, Florida)
            needed their grid position hand-adjusted just to make the layout work at all.
          </p>
          <p>
            Observed PM2.5 comes from EPA's own monitoring network, pulled directly via their AQS
            API for every year 2006–2025, not the original paper's precomputed station averages.
            Averaging follows the paper's own convention: a plain unweighted mean across
            qualifying stations (at least 15 years of data, 50+ observations a year), not weighted
            by population or land area.
          </p>
          <p>
            The counterfactual comes from Stanford's{" "}
            <a
              href="https://github.com/echolab-stanford/smokePM-version1.1"
              target="_blank"
              rel="noreferrer"
            >
              smokePM-version1.1
            </a>{" "}
            model, which estimates county-level daily wildfire smoke by combining satellite plume
            tracking with ground and reanalysis data. It's joined to each EPA station using the
            county FIPS code embedded in the station's own ID, then averaged the same way as the
            observed side, and currently runs through 2023. Where the smoke model has no row for a
            given county-day, that means zero smoke by the dataset's own convention, not a missing
            value.
          </p>
          <p>
            Because the observed side is rebuilt from scratch rather than reusing the paper's own
            fixed set of roughly 914 qualifying stations, small differences from its originally
            published numbers are expected. A spot check against the paper's own figures found
            agreement within about 0.2–1 µg/m³ for the years both cover, same shape, same spikes.
          </p>
          <p>
            Alaska and Hawaii aren't shown here. That's not a layout problem, the grid template
            actually has room for both. It's a data one: the underlying wildfire-smoke research,
            both the original paper and the newer model it's extended with, is scoped to the
            contiguous US, so there's no smoke-free counterfactual to compare either state
            against.
          </p>
        </details>
      </footer>
    </div>
  );
}
