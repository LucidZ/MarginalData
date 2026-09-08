import { useMemo } from "react";
import AgeScatter, { type ScatterPoint } from "./AgeScatter";
import { useActiveStep } from "./useActiveStep";
import { fmtPct, fmtPP } from "./format";
import type { VoterAgeData, AgeBin } from "./types";

const BIN_ORDER: AgeBin[] = ["18-24", "25-34", "35-44", "45-64", "65+"];
const CYCLES = [2016, 2018, 2020, 2022, 2024];
// +1 step for the trailing summary, which reuses the final (2024) view
const STEP_COUNT = CYCLES.length + 1;

export default function Beat2({ data }: { data: VoterAgeData }) {
  const { activeStep: step, setStepRef } = useActiveStep(STEP_COUNT);
  const year = CYCLES[Math.min(step, CYCLES.length - 1)];
  const cycle = data.nationalByBin.find((c) => c.year === year)!;

  // Shared domain across all 5 cycles so the cloud visibly slides between
  // steps, instead of each cycle silently re-zooming to its own range.
  const fixedDomain = useMemo((): [number, number] => {
    const values = data.nationalByBin.flatMap((c) =>
      BIN_ORDER.flatMap((b) => [c.bins[b].shareElig, c.bins[b].shareVote])
    );
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.12;
    return [Math.max(0, lo - pad), hi + pad];
  }, [data]);

  const points: ScatterPoint[] = BIN_ORDER.map((bin, i) => ({
    key: `bin-${bin}`,
    x: cycle.bins[bin].shareElig,
    y: cycle.bins[bin].shareVote,
    seqT: i / (BIN_ORDER.length - 1),
    r: 10,
    colorClass: cycle.isPresidential ? "voa-cat-pres" : "voa-cat-mid",
  }));

  const worstMid = data.nationalByBin.reduce((worst, c) =>
    !c.isPresidential && c.under35Gap < worst.under35Gap ? c : worst
  , data.nationalByBin[0]);
  const bestPres = data.nationalByBin.reduce((best, c) =>
    c.isPresidential && c.under35Gap > best.under35Gap ? c : best
  , data.nationalByBin[0]);

  const tooltipForBin = (p: ScatterPoint) => {
    const bin = p.key.replace("bin-", "") as AgeBin;
    const stats = cycle.bins[bin];
    return (
      <>
        <div className="voa-tooltip__head">
          {bin} · {cycle.year} ({cycle.isPresidential ? "presidential" : "midterm"})
        </div>
        <div>Eligible: <strong>{fmtPct(stats.shareElig)}</strong></div>
        <div>Votes cast: <strong>{fmtPct(stats.shareVote)}</strong></div>
        <div>Turnout: <strong>{fmtPct(stats.turnout)}</strong></div>
      </>
    );
  };

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">Beat 2 — Midterms make it worse</h2>
      <div className="voa-scrolly">
        <div className="voa-scrolly-viz">
          <AgeScatter points={points} fixedDomain={fixedDomain} tooltipFor={tooltipForBin} />
          <div className="voa-legend">
            <span className="voa-legend-swatch voa-cat-pres" />
            <span>presidential</span>
            <span className="voa-legend-swatch voa-cat-mid" />
            <span>midterm</span>
          </div>
        </div>
        <div className="voa-scrolly-steps">
          {CYCLES.map((y, i) => {
            const c = data.nationalByBin.find((cy) => cy.year === y)!;
            return (
              <div className="voa-step" key={y} ref={setStepRef(i)}>
                <div className="voa-step-inner">
                  <h3>
                    {y} — {c.isPresidential ? "presidential" : "midterm"}
                  </h3>
                  <p>
                    Under-35 turnout: <strong>{fmtPct(c.under35Turnout)}</strong>. 65+ turnout:{" "}
                    <strong>{fmtPct(c.over65Turnout)}</strong>. Representation gap:{" "}
                    <strong>{fmtPP(c.under35Gap)}</strong>.
                  </p>
                  {!c.isPresidential && (
                    <p>
                      Older voters barely notice a midterm is happening. Younger voters mostly sit
                      it out.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          <div className="voa-step" ref={setStepRef(CYCLES.length)}>
            <div className="voa-step-inner">
              <div className="voa-callout">
                In {worstMid.year}, 65+ turnout ({fmtPct(worstMid.over65Turnout)}) was{" "}
                <strong>{(worstMid.over65Turnout / worstMid.under35Turnout).toFixed(2)}x</strong>{" "}
                under-35 turnout ({fmtPct(worstMid.under35Turnout)}) — nearly double. 65+ turnout
                barely moves between election types (
                {fmtPct(Math.min(...data.nationalByBin.map((c) => c.over65Turnout)))}–
                {fmtPct(Math.max(...data.nationalByBin.map((c) => c.over65Turnout)))}), while
                under-35 turnout collapses in a midterm. In {bestPres.year}, the gap narrows to{" "}
                {fmtPP(bestPres.under35Gap)} — still negative, just less so.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
