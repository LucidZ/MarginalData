import { useMemo } from "react";
import PopulationBars, { type PopulationBarRow } from "./PopulationBars";
import StickyViz from "./StickyViz";
import { useActiveStep } from "./useActiveStep";
import { fmtM, fmtMSigned, fmtPct } from "./format";
import type { VoterAgeData, AgeRow } from "./types";

const STEP_COUNT = 6;

function toBarRow(row: AgeRow): PopulationBarRow {
  return {
    key: `age-${row.age}`,
    x: row.age,
    label: row.age === 100 ? "100+" : String(row.age),
    cvap: row.cvap,
    votes: row.votes,
    expected: row.expected,
    missing: row.missing,
    turnout: row.turnout,
    ratesPooled: row.ratesPooled,
  };
}

export default function Beat1({ data }: { data: VoterAgeData }) {
  const { activeStep: step, setStepRef } = useActiveStep(STEP_COUNT);
  const cycle = data.byAge["2024"];
  const rows = useMemo(() => cycle.rows.map(toBarRow), [cycle]);

  const under35Missing = cycle.rows.filter((r) => r.age < 35).reduce((s, r) => s + r.missing, 0);
  // Every age that fell short, summed - the same quantity the chart shades gold.
  const totalMissing = cycle.rows.reduce((s, r) => s + Math.min(0, r.missing), 0);

  const age25 = cycle.rows.find((r) => r.age === 25)!;
  const age75 = cycle.rows.find((r) => r.age === 75)!;

  // Votes short of the 65+ benchmark among ages 80 and up specifically -
  // small in raw votes (that population is small), but the point is the
  // reversal: even the oldest ages eventually fall under the standard
  // their own age group sets.
  const missing80Plus = cycle.rows.filter((r) => r.age >= 80).reduce((s, r) => s + Math.min(0, r.missing), 0);

  const tooltipFor = (row: PopulationBarRow) => (
    <>
      <div className="voa-tooltip__head">Age {row.label}{row.ratesPooled ? " (rate shared across 80-84/85+)" : ""}</div>
      {fmtM(row.cvap)} eligible · {fmtM(row.votes)} voted ({fmtPct(row.turnout)})
      <br />
      Expected at {fmtPct(cycle.over65Turnout)} (the 65+ rate): {fmtM(row.expected)}
      <div className="voa-tooltip__note">{fmtMSigned(row.missing)} vs. that benchmark</div>
    </>
  );

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">1. The shape of the electorate</h2>
      <div className="voa-scrolly">
        <StickyViz>
          <PopulationBars
            rows={rows}
            xKind="age"
            xLabel="Age"
            yLabel="People (millions)"
            showTrack
            showVotes={step >= 1}
            showExpected={step >= 2}
            expectedLineLabel={`expected at the 65+ rate (${fmtPct(cycle.over65Turnout)})`}
            showGap={step >= 3}
            tooltipFor={tooltipFor}
          />
        </StickyViz>
        <div className="voa-scrolly-steps">
          <div className="voa-step" ref={setStepRef(0)}>
            <div className="voa-step-inner">
              <h3>Every bar is one year of age</h3>
              <p>
                The light bar is how many citizens of that age were eligible to vote in 2024. There are more
                25-year-olds ({fmtM(age25.cvap)} eligible) than 75-year-olds ({fmtM(age75.cvap)}) — the population
                just gets thinner with age, the way it does in most rich countries.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(1)}>
            <div className="voa-step-inner">
              <h3>Now add who actually voted</h3>
              <p>
                The solid bar is votes cast. It's shorter than the light bar everywhere — turnout is never 100% — but
                not by the same amount at every age. Watch how much of the light bar the solid one covers as you move
                left to right.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(2)}>
            <div className="voa-step-inner">
              <h3>The dotted line is what 65-and-over does</h3>
              <p>
                It traces what each age's vote bar would reach if every age turned out the way people 65 and older
                actually do: {fmtPct(cycle.over65Turnout)}. That's the most reliable bloc in the electorate — the
                one group whose turnout barely moves from one election to the next — so it's a steadier yardstick
                than a national average that blends every age together.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(3)}>
            <div className="voa-step-inner">
              <h3>Fill in what's missing</h3>
              <p>
                Gold is the distance from a bar up to that line: votes an age would have cast at the 65+ rate, and
                didn't. The gold runs out around age {cycle.crossoverAge} — not a hard cutoff, a few ages just below
                it already clear the line before it holds for good, but that's roughly where turnout catches up to
                the 65+ standard.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(4)}>
            <div className="voa-step-inner">
              <h3>In votes, not percentages</h3>
              <p>
                Add the gold up and it comes to <strong>{fmtM(Math.abs(totalMissing))} votes</strong> — ballots that
                would exist if every age turned out the way 65-and-overs do. Most of it is concentrated young:
                under-35s account for <strong>{fmtM(Math.abs(under35Missing))}</strong> of the total on their own.
              </p>
              <div className="voa-callout">
                {fmtM(Math.abs(totalMissing))} missing votes, {fmtPct((Math.abs(totalMissing) / cycle.totalVotes) * 100)}{" "}
                of every ballot cast in 2024 — and <strong>{fmtM(Math.abs(under35Missing))}</strong> of it is under 35.
              </div>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(5)}>
            <div className="voa-step-inner">
              <h3>Even 65+'s own standard doesn't hold forever</h3>
              <p>
                Watch the far right edge: by around age {cycle.declineAge}, the gold comes back. Turnout keeps
                declining into the 80s and 90s — even the age group that sets this bar eventually falls short of
                it. The 65+ line isn't a ceiling everyone past 65 clears; it's a bloc average with its own decline
                built in at the far end.
              </p>
              <div className="voa-callout">
                <strong>{fmtM(Math.abs(missing80Plus))}</strong> of the shortfall is ages 80 and up — a small slice
                of a small population, but a real reversal of the pattern the rest of the chart shows.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
