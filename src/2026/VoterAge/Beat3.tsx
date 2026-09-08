import { useMemo } from "react";
import StateGrid from "./StateGrid";
import { fmtPP } from "./format";
import type { VoterAgeData } from "./types";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default function Beat3({ data }: { data: VoterAgeData }) {
  const pooledValues = data.states.map((s) => s.under35GapPooled ?? 0);
  const domain = useMemo((): [number, number] => {
    return [Math.min(...pooledValues), Math.max(...pooledValues)];
  }, [pooledValues]);

  const sorted = [...data.states].sort(
    (a, b) => (a.under35GapPooled ?? 0) - (b.under35GapPooled ?? 0)
  );
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  const med = median(pooledValues);
  const moeValues = data.states.map((s) => s.moeVoted1824_2024).filter((v): v is number => v != null);
  const medianMoe = median(moeValues);
  const gapSd = Math.sqrt(
    pooledValues.reduce((sum, v) => sum + (v - pooledValues.reduce((s, x) => s + x, 0) / pooledValues.length) ** 2, 0) /
      (pooledValues.length - 1)
  );

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">Beat 3 — It varies by state</h2>
      <div className="voa-scrolly">
        <div className="voa-scrolly-viz">
          <StateGrid
            states={data.states}
            valueFor={(s) => s.under35GapPooled}
            domain={domain}
            legendCaption="pooled 2016/2020/2024"
          />
        </div>
        <div className="voa-scrolly-steps">
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>Every state, negative</h3>
              <p>
                All <strong>51</strong> jurisdictions — every state plus DC — have a negative
                under-35 representation gap. Not one is at parity. This isn't a regional problem;
                it's universal. Values here are pooled across 2016, 2020, and 2024 — a single
                year is mostly noise, as step 3 shows.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>Best and worst</h3>
              <p>
                <strong>{best.state}</strong> comes closest to parity at{" "}
                <strong>{fmtPP(best.under35GapPooled ?? 0)}</strong>.{" "}
                <strong>{worst.state}</strong> is furthest at{" "}
                <strong>{fmtPP(worst.under35GapPooled ?? 0)}</strong>. Median across all states:{" "}
                <strong>{fmtPP(med)}</strong>.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>Most of this ranking is noise</h3>
              <p>
                The median margin of error on a state's 18–24 turnout estimate is{" "}
                <strong>±{medianMoe.toFixed(1)}pp</strong> — while the actual spread between
                states is only <strong>{gapSd.toFixed(2)}pp</strong>. Checking whether a state's
                rank replicates year to year (correlating the gap across 2016/2020/2024 and
                2018/2022) gives r ≈ 0.46 — roughly <strong>21%</strong> of the visible
                between-state variation is a real, persistent difference; the rest is sampling
                noise. States do differ. Don't trust a single state's exact rank.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
