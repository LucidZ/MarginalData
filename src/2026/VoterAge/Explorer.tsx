import { useCallback, useMemo, useState } from "react";
import PopulationBars, { type PopulationBarRow } from "./PopulationBars";
import YearControl, { type YearOption } from "./YearControl";
import { toBarRow } from "./ageRows";
import { fmtM, fmtMSigned, fmtPct } from "./format";
import { explorerCopy, type ExplorerVals } from "./copy";
import type { VoterAgeData } from "./types";

const DEFAULT_YEAR = "2024";

/**
 * Every November election in byAge, one at a time, in the registration view
 * beat 2 ends on: eligible track, registered bar, votes bar, the year's own
 * 65+ registration line with the gold gap under it, and the two hurdle
 * totals. A plain section, not a scrolly - the reader drives it with the
 * year buttons.
 *
 * Switching years tweens each bar in place at its age slot (rows keyed
 * `age-N`, d3's 700ms tween). No cohort slide: that only makes sense for a
 * two-year hop, and here the reader jumps anywhere (2012 -> 2024). The y
 * domain is fixed across all cycles so a year change never reads as a zoom.
 */
export default function Explorer({ data }: { data: VoterAgeData }) {
  const options: YearOption[] = useMemo(
    () =>
      Object.keys(data.byAge)
        .sort()
        .map((year) => ({ year, kind: data.byAge[year].kind })),
    [data]
  );
  const [year, setYear] = useState(DEFAULT_YEAR in data.byAge ? DEFAULT_YEAR : options[options.length - 1].year);
  const cycle = data.byAge[year];

  const rows = useMemo(() => cycle.rows.map(toBarRow), [cycle]);
  const rowsByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  const yDomain = useMemo((): [number, number] => {
    const maxCvap = Math.max(...Object.values(data.byAge).flatMap((c) => c.rows.map((r) => r.cvap)));
    return [0, maxCvap * 1.08];
  }, [data]);

  // Mirrors the beats' registration-view tooltip (AgeBeats.tsx, step >=
  // REG_GAP_STEP), for whichever year is selected. Reads the selected
  // cycle's own rows, never the mid-tween geometry.
  const tooltipFor = useCallback(
    (row: PopulationBarRow) => {
      const real = rowsByKey.get(row.key);
      if (!real) return null;
      const didntVote = real.registered! - real.votes;
      return (
        <>
          <div className="voa-tooltip__head">
            Age {real.label} · {year}
            {real.ratesPooled ? " (rate shared across 80-84/85+)" : ""}
          </div>
          {fmtM(real.cvap)} eligible · {fmtM(real.registered!)} registered · {fmtM(real.votes)} voted (
          {fmtPct(real.turnout)})
          <br />
          At the {year} 65+ registration rate ({fmtPct(cycle.over65Registration)}): {fmtM(real.expectedRegistered!)}{" "}
          registered
          <br />
          <div className="voa-tooltip__note">
            {fmtMSigned(real.registered! - real.expectedRegistered!)} registered vs. that standard ·{" "}
            {fmtM(didntVote)} registered but didn't vote
          </div>
        </>
      );
    },
    [rowsByKey, year, cycle]
  );

  const vals: ExplorerVals = { firstYear: options[0].year };

  return (
    <section className="voa-beat voa-explorer">
      <h2 className="voa-beat-title">{explorerCopy.title(vals)}</h2>
      <div className="voa-explorer-intro">{explorerCopy.intro(vals)}</div>
      <YearControl options={options} selected={year} onSelect={setYear} />
      <div className="voa-explorer-chart">
        <PopulationBars
          rows={rows}
          xKind="age"
          xLabel="Age"
          yLabel="People (millions)"
          showTrack
          showVotes
          registeredOpacity={1}
          registrationStandard={{ line: 1, gap: 1 }}
          showExpected={false}
          showGap={false}
          expectedLineLabel={`at 65+ registration (${fmtPct(cycle.over65Registration)})`}
          gapLegendLabel="Not registered"
          heroGap={{
            items: [
              { figure: fmtM(cycle.registrationGap), label: explorerCopy.heroNotRegistered, delta: "", swatch: "gap" },
              {
                figure: fmtM(cycle.registeredNotVoted),
                label: explorerCopy.heroNotVoted,
                delta: "",
                swatch: "registered",
              },
            ],
            deltaOpacity: 0,
          }}
          yDomain={yDomain}
          transitionMs={700}
          tooltipFor={tooltipFor}
        />
      </div>
    </section>
  );
}
