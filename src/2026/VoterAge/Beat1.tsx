import { useMemo } from "react";
import PopulationBars, { type PopulationBarRow } from "./PopulationBars";
import { useActiveStep } from "./useActiveStep";
import { fmtM, fmtMSigned, fmtPct } from "./format";
import type { VoterAgeData, AgeRow } from "./types";

const STEP_COUNT = 5;

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

  const under35 = cycle.rows.filter((r) => r.age < 35);
  const over65 = cycle.rows.filter((r) => r.age >= 65);
  const under35Missing = under35.reduce((s, r) => s + r.missing, 0);
  const over65Missing = over65.reduce((s, r) => s + r.missing, 0);

  const age25 = cycle.rows.find((r) => r.age === 25)!;
  const age75 = cycle.rows.find((r) => r.age === 75)!;

  const tooltipFor = (row: PopulationBarRow) => (
    <>
      <div className="voa-tooltip__head">Age {row.label}{row.ratesPooled ? " (rate shared across 80-84/85+)" : ""}</div>
      {fmtM(row.cvap)} eligible · {fmtM(row.votes)} voted ({fmtPct(row.turnout)})
      <br />
      Expected at {fmtPct(cycle.avgTurnout)}: {fmtM(row.expected)}
      <div className="voa-tooltip__note">{fmtMSigned(row.missing)} vs. proportional</div>
    </>
  );

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">1. The shape of the electorate</h2>
      <div className="voa-scrolly">
        <div className="voa-scrolly-viz">
          <PopulationBars
            rows={rows}
            xKind="age"
            xLabel="Age"
            yLabel="People (millions)"
            showTrack
            showVotes={step >= 1}
            showExpected={step >= 2}
            signColor={step >= 3}
            tooltipFor={tooltipFor}
          />
        </div>
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
              <h3>The dotted line is what "fair" would look like</h3>
              <p>
                It traces what each age's vote bar would reach if every age voted at the national average,{" "}
                {fmtPct(cycle.avgTurnout)}. Since it's just each bar's population scaled by one number, the dotted
                line has the same shape as the population curve itself.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(3)}>
            <div className="voa-step-inner">
              <h3>Below the line, above the line</h3>
              <p>
                Color the bars by whether they clear that line. Red bars voted less than their share of the
                population would predict; green bars voted more. The switch happens around age {cycle.crossoverAge}{" "}
                — not a hard cutoff, turnout dips back under a few more times before settling above for good, but
                that's roughly where the electorate stops skewing young and starts skewing old.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(4)}>
            <div className="voa-step-inner">
              <h3>In votes, not percentages</h3>
              <p>
                Sum the gaps on each side of that line. Everyone under 35 cast <strong>{fmtM(Math.abs(under35Missing))}
                {" "}fewer</strong> votes than proportional turnout would have given them. Everyone 65 and older cast{" "}
                <strong>{fmtM(over65Missing)} more</strong>.
              </p>
              <div className="voa-callout">
                <strong>{fmtMSigned(under35Missing)}</strong> under 35 · <strong>{fmtMSigned(over65Missing)}</strong>{" "}
                age 65+, relative to a same-turnout-for-everyone electorate.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
