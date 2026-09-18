import { useMemo } from "react";
import PopulationBars, { type PopulationBarRow } from "./PopulationBars";
import StickyViz from "./StickyViz";
import { useStepProgress } from "./useStepProgress";
import { fmtM, fmtMSigned, fmtPct } from "./format";
import type { VoterAgeData, AgeRow } from "./types";

const STEP_COUNT = 3;
const COMPARE_AGES = [18, 22, 65, 79];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function toBarRow(row: AgeRow, avgTurnout: number): PopulationBarRow {
  return {
    key: `age-${row.age}`,
    x: row.age,
    label: row.age === 100 ? "100+" : String(row.age),
    cvap: row.cvap,
    votes: row.votes,
    expected: row.expected,
    expected2: (row.cvap * avgTurnout) / 100,
    missing: row.missing,
    turnout: row.turnout,
    ratesPooled: row.ratesPooled,
  };
}

function missingSum(rows: AgeRow[], test: (age: number) => boolean) {
  return rows.filter((r) => test(r.age)).reduce((s, r) => s + r.missing, 0);
}

export default function Beat2({ data }: { data: VoterAgeData }) {
  const { progress, setStepRef } = useStepProgress(STEP_COUNT);
  const cycle2024 = data.byAge["2024"];
  const cycle2022 = data.byAge["2022"];

  const rows2024 = useMemo(() => cycle2024.rows.map((r) => toBarRow(r, cycle2024.avgTurnout)), [cycle2024]);
  const rows2022 = useMemo(() => cycle2022.rows.map((r) => toBarRow(r, cycle2022.avgTurnout)), [cycle2022]);

  // progress 0 = step 0 centered, 1 = step 1 centered. Start the morph after
  // the reader has left step 0's text and finish it before step 1's is
  // centered, so the end state is on screen while its paragraph is being read.
  const t = clamp01((progress - 0.15) / 0.7);
  const e2 = clamp01((t - 0.6) / 0.4);

  const activeRows = useMemo(
    () =>
      rows2024.map((r, i) => {
        const b = rows2022[i];
        return {
          ...r,
          cvap: lerp(r.cvap, b.cvap, t),
          votes: lerp(r.votes, b.votes, t),
          expected: lerp(r.expected, b.expected, t),
          expected2: lerp(r.expected2!, b.expected2!, t),
          missing: lerp(r.missing, b.missing, t),
          turnout: lerp(r.turnout, b.turnout, t),
        };
      }),
    [rows2024, rows2022, t]
  );

  const over65 = lerp(cycle2024.over65Turnout, cycle2022.over65Turnout, t);
  const avgTurnout = lerp(cycle2024.avgTurnout, cycle2022.avgTurnout, t);

  const yDomain = useMemo((): [number, number] => {
    const maxCvap = Math.max(...cycle2024.rows.map((r) => r.cvap), ...cycle2022.rows.map((r) => r.cvap));
    return [0, maxCvap * 1.08];
  }, [cycle2024, cycle2022]);

  const under35Missing2024 = missingSum(cycle2024.rows, (a) => a < 35);
  const under35Missing2022 = missingSum(cycle2022.rows, (a) => a < 35);

  const compareRows = COMPARE_AGES.map((age) => ({
    age,
    t2024: cycle2024.rows.find((r) => r.age === age)!.turnout,
    t2022: cycle2022.rows.find((r) => r.age === age)!.turnout,
  }));

  const tooltipFor = (row: PopulationBarRow) => (
    <>
      <div className="voa-tooltip__head">Age {row.label}</div>
      {fmtM(row.cvap)} eligible · {fmtM(row.votes)} voted ({fmtPct(row.turnout)})
      <div className="voa-tooltip__note">{fmtMSigned(row.missing)} vs. proportional</div>
    </>
  );

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">2. Midterms make it worse</h2>
      <div className="voa-scrolly">
        <StickyViz>
          <PopulationBars
            rows={activeRows}
            xKind="age"
            xLabel="Age"
            yLabel="People (millions)"
            showTrack
            showVotes
            showExpected
            expectedLineLabel={`expected at the 65+ rate (${fmtPct(over65)})`}
            showExpected2={e2 > 0}
            expected2Opacity={e2}
            expectedLine2Label={`expected at the national average (${fmtPct(avgTurnout)})`}
            showGap
            yDomain={yDomain}
            tooltipFor={tooltipFor}
            transitionMs={0}
          />
        </StickyViz>
        <div className="voa-scrolly-steps">
          <div className="voa-step" ref={setStepRef(0)}>
            <div className="voa-step-inner">
              <h3>No president on the ballot</h3>
              <p>
                This is the same 2024 chart from beat one. In a midterm election — no presidential race — turnout
                drops for everyone. The question is whether it drops evenly.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(1)}>
            <div className="voa-step-inner">
              <h3>2022: watch both quantities fall</h3>
              <p>
                The bars drop, and the dotted line drops a little too — because it's set to <em>that year's</em>{" "}
                65+ turnout ({fmtPct(cycle2022.over65Turnout)}, down from {fmtPct(cycle2024.over65Turnout)}). But
                65-and-overs barely change their habits between a presidential year and a midterm. What doesn't
                scale down evenly is how far short of that steady line the young bars fall.
              </p>
              <p>
                The second, orange dotted line shows a lower bar: what each age group would need to hit to match{" "}
                <em>{fmtPct(cycle2022.avgTurnout)}, the national average</em> that year. Most of the youngest bars
                fall short of even that.
              </p>
              <div className="voa-callout">
                Under-35 shortfall: <strong>{fmtMSigned(under35Missing2024)}</strong> in 2024 →{" "}
                <strong>{fmtMSigned(under35Missing2022)}</strong> in 2022.
              </div>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(2)}>
            <div className="voa-step-inner">
              <h3>The young nearly stop showing up; the old barely notice</h3>
              <p>Turnout by single year of age, presidential vs. midterm:</p>
              <table className="voa-compare-table">
                <thead>
                  <tr>
                    <th>Age</th>
                    <th>2024</th>
                    <th>2022</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((r) => (
                    <tr key={r.age}>
                      <td>{r.age}</td>
                      <td>{fmtPct(r.t2024)}</td>
                      <td>{fmtPct(r.t2022)}</td>
                      <td className={r.t2022 - r.t2024 < -10 ? "voa-compare-big-drop" : ""}>
                        {(r.t2022 - r.t2024).toFixed(1)}pp
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                An 18-year-old's turnout is nearly cut in half. A 79-year-old's barely moves. Older voters show up
                regardless of what's on the ballot; younger voters mostly show up for president.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
