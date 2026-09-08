import { useMemo } from "react";
import AgeScatter, { type ScatterPoint, type ScatterAnnotation } from "./AgeScatter";
import { useActiveStep } from "./useActiveStep";
import { fmtPct, fmtPP } from "./format";
import type { VoterAgeData, SingleYearRow } from "./types";

const STEP_COUNT = 4;
const MIDTERM_YEAR = "2022";
const PRES_YEAR = "2024";

function toGapPoints(rows: SingleYearRow[], year: string, colorClass: string): ScatterPoint[] {
  return rows.map((row) => ({
    key: `${year}-age-${row.age}`,
    x: row.age,
    y: row.shareVote - row.shareElig,
    seqT: 0,
    r: 3,
    colorClass,
  }));
}

export default function Beat2({ data }: { data: VoterAgeData }) {
  const { activeStep: step, setStepRef } = useActiveStep(STEP_COUNT);

  const rowsPres = data.nationalByYearOfAge[PRES_YEAR];
  const rowsMid = data.nationalByYearOfAge[MIDTERM_YEAR];

  const presPoints = useMemo(() => toGapPoints(rowsPres, PRES_YEAR, "voa-cat-pres"), [rowsPres]);
  const midPoints = useMemo(() => toGapPoints(rowsMid, MIDTERM_YEAR, "voa-cat-mid"), [rowsMid]);

  // Stable domain from both years combined, so the axes don't rescale
  // when the midterm curve is added in step 1 - only the second line appears.
  const xDomain = useMemo((): [number, number] => {
    const ages = [...rowsPres, ...rowsMid].map((r) => r.age);
    return [Math.min(...ages) - 3, Math.max(...ages) + 3];
  }, [rowsPres, rowsMid]);
  const yDomain = useMemo((): [number, number] => {
    const gaps = [...rowsPres, ...rowsMid].map((r) => r.shareVote - r.shareElig);
    const lo = Math.min(...gaps);
    const hi = Math.max(...gaps);
    const pad = (hi - lo) * 0.15;
    return [lo - pad, hi + pad];
  }, [rowsPres, rowsMid]);

  const gapOf = (row: SingleYearRow) => row.shareVote - row.shareElig;
  const youngestPres = rowsPres.find((r) => r.age === Math.min(...rowsPres.map((x) => x.age)))!;
  const youngestMid = rowsMid.find((r) => r.age === Math.min(...rowsMid.map((x) => x.age)))!;
  // The peak (max-gap) row - among the oldest ages in practice, but found
  // by actual value rather than assumed, since the curve dips slightly
  // past 40 and declines again after ~80 (see Beat 1's full reveal).
  const peakPres = rowsPres.reduce((a, b) => (gapOf(b) > gapOf(a) ? b : a));
  const peakMid = rowsMid.reduce((a, b) => (gapOf(b) > gapOf(a) ? b : a));

  const points = step === 0 ? presPoints : [...presPoints, ...midPoints];

  const extremeAnnotations: ScatterAnnotation[] =
    step >= 2
      ? [
          {
            x: youngestMid.age,
            y: gapOf(youngestMid),
            text: `age ${youngestMid.age}: ${fmtPP(gapOf(youngestMid))} in ${MIDTERM_YEAR}`,
            dx: 16,
            dy: -30,
          },
          {
            x: peakMid.age,
            y: gapOf(peakMid),
            text: `age ${peakMid.age}: ${fmtPP(gapOf(peakMid))} in ${MIDTERM_YEAR}`,
            dx: -16,
            dy: 24,
          },
        ]
      : [];

  const cyclePres = data.nationalByBin.find((c) => String(c.year) === PRES_YEAR)!;
  const cycleMid = data.nationalByBin.find((c) => String(c.year) === MIDTERM_YEAR)!;

  const rowForPoint = (p: ScatterPoint) => {
    const [year, , ageStr] = p.key.split("-");
    return data.nationalByYearOfAge[year].find((r) => r.age === Number(ageStr));
  };
  const tooltipFor = (p: ScatterPoint) => {
    const row = rowForPoint(p);
    if (!row) return null;
    const year = p.key.split("-")[0];
    return (
      <>
        <div className="voa-tooltip__head">Age {row.age} · {year}</div>
        <div>Gap: <strong>{fmtPP(p.y)}</strong></div>
        <div>Turnout: <strong>{fmtPct(row.turnout)}</strong></div>
      </>
    );
  };

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">Beat 2 — Midterms make it worse</h2>
      <div className="voa-scrolly">
        <div className="voa-scrolly-viz">
          <AgeScatter
            points={points}
            xDomain={xDomain}
            yDomain={yDomain}
            xLabel="Age"
            yLabel="Over/under representation (pp)"
            xTickFormat={(d) => `${d}`}
            yTickFormat={(d) => fmtPP(d, 1)}
            connectLines
            annotations={extremeAnnotations}
            tooltipFor={tooltipFor}
            defaultRadius={3}
          />
          <div className="voa-legend">
            <span className="voa-legend-swatch voa-cat-pres" />
            <span>2024 (presidential)</span>
            <span className="voa-legend-swatch voa-cat-mid" />
            <span>2022 (midterm)</span>
          </div>
        </div>
        <div className="voa-scrolly-steps">
          <div className="voa-step" ref={setStepRef(0)}>
            <div className="voa-step-inner">
              <h3>Here's 2024 again</h3>
              <p>
                Same curve as before: over/under-representation by age, in the 2024 presidential
                election. Now let's compare it to a midterm.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(1)}>
            <div className="voa-step-inner">
              <h3>Overlay 2022</h3>
              <p>
                Here's the same curve for 2022 — a midterm, no presidential race on the ballot.
                It follows the same shape, but swings further at both ends.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(2)}>
            <div className="voa-step-inner">
              <h3>Both ends stretch</h3>
              <p>
                At age {youngestMid.age}, the gap is <strong>{fmtPP(gapOf(youngestMid))}</strong> in
                2022 versus <strong>{fmtPP(gapOf(youngestPres))}</strong> in 2024. At the oldest
                ages, it's <strong>{fmtPP(gapOf(peakMid))}</strong> versus{" "}
                <strong>{fmtPP(gapOf(peakPres))}</strong>. Same direction, bigger swing.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(3)}>
            <div className="voa-step-inner">
              <h3>Older voters barely notice</h3>
              <p>
                65+ turnout barely moved between these two elections:{" "}
                <strong>{fmtPct(cyclePres.over65Turnout)}</strong> in 2024 vs.{" "}
                <strong>{fmtPct(cycleMid.over65Turnout)}</strong> in 2022. Under-35 turnout
                collapsed: <strong>{fmtPct(cyclePres.under35Turnout)}</strong> down to{" "}
                <strong>{fmtPct(cycleMid.under35Turnout)}</strong>. Older voters show up
                regardless; younger voters mostly show up for presidents.
              </p>
              <div className="voa-callout">
                In 2022, 65+ turnout ({fmtPct(cycleMid.over65Turnout)}) was{" "}
                <strong>{(cycleMid.over65Turnout / cycleMid.under35Turnout).toFixed(2)}x</strong>{" "}
                under-35 turnout ({fmtPct(cycleMid.under35Turnout)}).
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
