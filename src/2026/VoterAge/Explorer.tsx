import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PopulationBars, { type PopulationBarRow } from "./PopulationBars";
import YearControl, { type YearOption } from "./YearControl";
import { cohortRows, hopRows } from "./ageRows";
import { fmtM, fmtPct } from "./format";
import { explorerCopy } from "./copy";
import type { VoterAgeData } from "./types";

/**
 * Every election by age, after the story: the beat 1-2 chart (eligible,
 * votes, the 65+ line and the gold shortfall) with the year buttons above
 * it. Not scroll-driven - picking a year plays the same cohort hop the
 * story's beat 2 does, once per election in between, on a timer. Bars are
 * keyed by birth cohort (ageRows.ts), so a jump from 2024 to 2012 slides
 * each generation twelve years younger rather than cutting.
 */

/** One hop's duration. A multi-year jump plays every hop in between. */
const HOP_MS = 450;

// Gentler than the scroll's gamma=3: the timer, not the reader, drives it.
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** Every age that fell short of its cycle's 65+ standard, summed. */
const shortfallOf = (rows: { missing: number }[]) =>
  Math.abs(rows.reduce((s, r) => s + Math.min(0, r.missing), 0));

export default function Explorer({ data }: { data: VoterAgeData }) {
  // Newest first, like AgeBeats: `pos` counts elections back from 2024.
  const years = useMemo(() => Object.keys(data.byAge).sort().reverse(), [data]);
  const restRows = useMemo(() => years.map((y) => cohortRows(data.byAge[y], Number(y))), [data, years]);
  const last = years.length - 1;

  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const pick = useCallback(
    (year: string) => {
      const target = years.indexOf(year);
      cancelAnimationFrame(raf.current);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        posRef.current = target;
        setPos(target);
        return;
      }
      let prev = performance.now();
      const tick = (now: number) => {
        // Firefox stamps a frame with its start time, which can precede the
        // performance.now() taken at the click - a negative step would push
        // pos past 2024 to -0.0x and index a row set that doesn't exist.
        const step = Math.max(0, now - prev) / HOP_MS;
        prev = now;
        const p = posRef.current;
        const next = p < target ? Math.min(target, p + step) : Math.max(target, p - step);
        posRef.current = next;
        setPos(next);
        if (next !== target) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [years]
  );

  const hop = Math.min(Math.floor(pos), last - 1);
  const t = ease(pos - hop);
  const rows = useMemo(() => {
    if (t <= 0) return restRows[hop];
    if (t >= 1) return restRows[hop + 1];
    return hopRows(restRows[hop], restRows[hop + 1], t);
  }, [restRows, hop, t]);

  // Printed numbers snap to a real election, never the lerped rows.
  const shownYear = years[Math.round(pos)];
  const shownCycle = data.byAge[shownYear];
  const resting = Number.isInteger(pos) ? shownYear : null;
  const shownRowsByKey = useMemo(
    () => new Map(restRows[Math.round(pos)].map((r) => [r.key, r])),
    [restRows, pos]
  );

  const options: YearOption[] = useMemo(
    () => [...years].reverse().map((year) => ({ year, kind: data.byAge[year].kind })),
    [years, data]
  );

  // Same pinned scale as the story's chart, so the two read alike.
  const yDomain = useMemo((): [number, number] => {
    const maxCvap = Math.max(...Object.values(data.byAge).flatMap((c) => c.rows.map((r) => r.cvap)));
    return [0, maxCvap * 1.08];
  }, [data]);

  const tooltipFor = useCallback(
    (row: PopulationBarRow) => {
      if (resting === null) return null; // mid-hop the bars describe no real election
      const real = shownRowsByKey.get(row.key);
      if (!real) return null;
      return (
        <>
          <div className="voa-tooltip__head">
            Age {real.label} · {shownYear}
            {real.ratesPooled ? " (rate shared across 80-84/85+)" : ""}
          </div>
          {fmtM(real.cvap)} eligible
          {` · ${fmtM(real.votes)} voted (${fmtPct(real.turnout)})`}
          <div className="voa-tooltip__note">
            At the {shownYear} 65+ rate ({fmtPct(shownCycle.over65Turnout)}): {fmtM(real.expected)}
          </div>
        </>
      );
    },
    [resting, shownRowsByKey, shownYear, shownCycle]
  );

  const vals = { firstYear: years[last] };

  return (
    <section className="voa-explorer">
      <h2 className="voa-beat-title">{explorerCopy.title}</h2>
      {explorerCopy.intro(vals)}
      <div className="voa-explorer-chart">
        {/* State for tests: pos = elections back from 2024. */}
        <span className="voa-explorer-state" data-pos={pos.toFixed(4)} data-resting={resting ?? ""} hidden />
        <YearControl
          options={options}
          shown={shownYear}
          resting={resting}
          dotPos={last - pos}
          dotOpacity={resting === null ? 1 : 0}
          opacity={1}
          onPick={pick}
        />
        <PopulationBars
          rows={rows}
          xKind="age"
          xLabel="Age"
          yLabel="People (millions)"
          showTrack
          showVotes
          expectedOpacity={1}
          gapOpacity={1}
          gapLegendLabel="Shortfall"
          expectedLineLabel={`at 65+ turnout (${fmtPct(shownCycle.over65Turnout)})`}
          heroGap={{
            items: [
              {
                figure: fmtM(shortfallOf(shownCycle.rows)),
                label: "fewer votes than the 65+ rate",
                delta: "",
                tone: "gap",
              },
              {
                figure: fmtPct(shownCycle.avgTurnout),
                label: "of eligible citizens voted",
                delta: "",
              },
            ],
            deltaOpacity: 0,
          }}
          yDomain={yDomain}
          transitionMs={0}
          tooltipFor={tooltipFor}
        />
      </div>
      <p className="voa-explorer-caveat">{explorerCopy.caveat(vals)}</p>
    </section>
  );
}
