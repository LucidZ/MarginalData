import { useMemo } from "react";
import PopulationBars, { type PopulationBarRow } from "./PopulationBars";
import StickyViz from "./StickyViz";
import { useActiveStep } from "./useActiveStep";
import { fmtM, fmtMSigned, fmtPct } from "./format";
import type { VoterAgeData, Dimension, DimensionRow } from "./types";

const STEP_COUNT = 4;

const EDUCATION_LABELS: Record<string, string> = {
  "Less than 9th grade": "< 9th grade",
  "9th to 12th grade, no diploma": "9th–12th, no diploma",
  "High school graduate": "HS grad",
  "Some college or associate's degree": "Some college",
  "Bachelor's degree": "Bachelor's",
  "Advanced degree": "Advanced degree",
};

const INCOME_LABELS: Record<string, string> = {
  "Under $10,000": "<$10K",
  "$10,000 to $14,999": "$10–15K",
  "$15,000 to $19,999": "$15–20K",
  "$20,000 to $29,999": "$20–30K",
  "$30,000 to $39,999": "$30–40K",
  "$40,000 to $49,999": "$40–50K",
  "$50,000 to $74,999": "$50–75K",
  "$75,000 to $99,999": "$75–100K",
  "$100,000 to $149,999": "$100–150K",
  "$150,000 and over": "$150K+",
};

const RACE_LABELS: Record<string, string> = {
  "White alone, not Hispanic": "White, non-Hisp.",
  "Black alone": "Black",
  "Asian alone": "Asian",
  "Hispanic (any race)": "Hispanic",
  "Other / multiple races": "Other",
};

function toBarRows(dim: Dimension, labels: Record<string, string>): PopulationBarRow[] {
  return dim.rows.map((r: DimensionRow) => ({
    key: r.group,
    x: r.group,
    label: labels[r.group] ?? r.group,
    cvap: r.cvap,
    votes: r.votes,
    expected: r.expected,
    missing: r.missing,
    turnout: r.turnout,
  }));
}

function extremes(dim: Dimension) {
  const sorted = [...dim.rows].sort((a, b) => a.turnout - b.turnout);
  return { lowest: sorted[0], highest: sorted[sorted.length - 1] };
}

export default function Beat3({ data }: { data: VoterAgeData }) {
  const { activeStep: step, setStepRef } = useActiveStep(STEP_COUNT);
  const { education, income, race } = data.byDimension;

  const eduRows = useMemo(() => toBarRows(education, EDUCATION_LABELS), [education]);
  const raceRows = useMemo(() => toBarRows(race, RACE_LABELS), [race]);
  const incomeRows = useMemo(() => toBarRows(income, INCOME_LABELS), [income]);

  const active = step <= 1 ? { dim: education, rows: eduRows } : step === 2 ? { dim: race, rows: raceRows } : { dim: income, rows: incomeRows };

  const eduLow = extremes(education).lowest;
  const eduHigh = extremes(education).highest;
  const HS_OR_LESS_GROUPS = ["Less than 9th grade", "9th to 12th grade, no diploma", "High school graduate"];
  const hsOrLess = education.rows.filter((r) => HS_OR_LESS_GROUPS.includes(r.group)).reduce((s, r) => s + r.missing, 0);

  const hispanic = race.rows.find((r) => r.group === "Hispanic (any race)")!;

  const under50k = income.rows.filter((r) => ["Under $10,000", "$10,000 to $14,999", "$15,000 to $19,999", "$20,000 to $29,999", "$30,000 to $39,999", "$40,000 to $49,999"].includes(r.group)).reduce((s, r) => s + r.missing, 0);

  const tooltipFor = (row: PopulationBarRow) => (
    <>
      <div className="voa-tooltip__head">{row.x}</div>
      {fmtM(row.cvap)} eligible · {fmtM(row.votes)} voted ({fmtPct(row.turnout)})
      <div className="voa-tooltip__note">{fmtMSigned(row.missing)} vs. proportional</div>
    </>
  );

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">3. It isn't only about age</h2>
      <div className="voa-scrolly">
        <StickyViz>
          <div className="voa-dim-caption">{active.dim.label} · avg turnout {fmtPct(active.dim.avgTurnout)}</div>
          <PopulationBars
            rows={active.rows}
            xKind="category"
            xLabel={active.dim.label}
            yLabel="People (millions)"
            showTrack
            showVotes
            showExpected
            showGap
            directLabelMissing
            tooltipFor={tooltipFor}
          />
          {active.dim.note && <p className="voa-dim-note">{active.dim.note}</p>}
        </StickyViz>
        <div className="voa-scrolly-steps">
          <div className="voa-step" ref={setStepRef(0)}>
            <div className="voa-step-inner">
              <h3>Age, education, income and race are all tangled together</h3>
              <p>
                This is a descriptive story, not a causal one — these four traits correlate heavily with each other,
                so none of what follows isolates "the effect" of any one of them. The point is narrower: age isn't
                the only axis where the electorate doesn't look like the country.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(1)}>
            <div className="voa-step-inner">
              <h3>Education is the biggest gap in the data</h3>
              <p>
                Turnout ranges from {fmtPct(eduLow.turnout)} (less than 9th grade) to {fmtPct(eduHigh.turnout)}{" "}
                (advanced degree) — a wider spread than age. High school or less accounts for nearly all of the gold
                here: <strong>{fmtM(Math.abs(hsOrLess))} missing votes</strong> across three groups.
              </p>
              <div className="voa-callout">
                Largest single gap in this story: <strong>{fmtMSigned(hsOrLess)}</strong> for high school or less.
              </div>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(2)}>
            <div className="voa-step-inner">
              <h3>Race and ethnicity</h3>
              <p>
                Hispanic voters fall <strong>{fmtM(Math.abs(hispanic.missing))}</strong> short of the line — the
                largest single gap on this chart. Black and Asian voters are short too, by smaller amounts, because
                those are smaller populations. White, non-Hispanic voters are the one group above it.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(3)}>
            <div className="voa-step-inner">
              <h3>Income shows the same pattern, and comes with a caveat</h3>
              <p>
                Family income runs a clean gradient from {fmtPct(income.rows[0].turnout)} to{" "}
                {fmtPct(income.rows[income.rows.length - 1].turnout)}. Households under $50k cast{" "}
                <strong>{fmtM(Math.abs(under50k))} fewer</strong> votes than proportional.
              </p>
              <p className="voa-dim-note">{income.note}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
