import { useMemo, useRef } from "react";
import AgeScatter, { type ScatterPoint } from "./AgeScatter";
import { useScrollProgress, stepFromProgress } from "./useScrollProgress";
import { fmtM, fmtPct, findCrossoverAge } from "./format";
import type { VoterAgeData, AgeBin } from "./types";

const BIN_ORDER: AgeBin[] = ["18-24", "25-34", "35-44", "45-64", "65+"];
const STEP_COUNT = 5;

export default function Beat1({ data }: { data: VoterAgeData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(containerRef);
  const step = stepFromProgress(progress, STEP_COUNT);

  const cycle2024 = data.nationalByBin.find((c) => c.year === 2024)!;
  const crossoverAge = useMemo(() => findCrossoverAge(data.nationalByYearOfAge), [data]);

  const binPoints: ScatterPoint[] = BIN_ORDER.map((bin, i) => ({
    key: `bin-${bin}`,
    x: cycle2024.bins[bin].shareElig,
    y: cycle2024.bins[bin].shareVote,
    seqT: i / (BIN_ORDER.length - 1),
    r: 10,
  }));

  const singleYearPoints: ScatterPoint[] = data.nationalByYearOfAge.map((row) => ({
    key: `age-${row.age}`,
    x: row.shareElig,
    y: row.shareVote,
    seqT: (row.age - 18) / (87 - 18),
    r: 4,
  }));

  const under35 = cycle2024.bins["18-24"].voted + cycle2024.bins["25-34"].voted;
  const over65 = cycle2024.bins["65+"].voted;

  const points = step === 0 ? [] : step === 1 ? binPoints : singleYearPoints;
  const annotation =
    step === 3 && crossoverAge != null
      ? {
          x: singleYearPoints.find((p) => p.key === `age-${crossoverAge}`)?.x ?? 0,
          y: singleYearPoints.find((p) => p.key === `age-${crossoverAge}`)?.y ?? 0,
          text: `~age ${crossoverAge}: crossover`,
        }
      : null;

  return (
    <section className="voa-beat" ref={containerRef}>
      <h2 className="voa-beat-title">Beat 1 — Turnout by age</h2>
      <div className="voa-scrolly">
        <div className="voa-scrolly-viz">
          <AgeScatter points={points} annotation={annotation} />
        </div>
        <div className="voa-scrolly-steps">
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>One person, one vote — but not one turnout rate</h3>
              <p>
                If every age group voted at the same rate, its dot would land exactly on this
                dashed line: its share of votes cast would match its share of eligible voters.
                Let's see where age groups actually land in the 2024 election.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>Five age groups, one election</h3>
              <p>
                Under-35 voters (18–34) are{" "}
                <strong>
                  {fmtPct(cycle2024.bins["18-24"].shareElig + cycle2024.bins["25-34"].shareElig)}
                </strong>{" "}
                of eligible citizens but cast only{" "}
                <strong>
                  {fmtPct(cycle2024.bins["18-24"].shareVote + cycle2024.bins["25-34"].shareVote)}
                </strong>{" "}
                of votes. 65-and-over are the mirror image:{" "}
                <strong>{fmtPct(cycle2024.bins["65+"].shareElig)}</strong> of eligible citizens,{" "}
                <strong>{fmtPct(cycle2024.bins["65+"].shareVote)}</strong> of votes cast.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>Every single year of age</h3>
              <p>
                Bucketing into five groups hides a lot. Here's every single year of age, 18
                through 85+, from the same election — 64 dots sweeping from underrepresented to
                overrepresented.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>The crossover</h3>
              <p>
                Somewhere around <strong>age {crossoverAge ?? "40"}</strong>, a birth cohort's
                share of votes cast starts to exceed its share of the eligible population. Below
                that age you're outnumbered relative to your share of the electorate; above it,
                you're overrepresented.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>In raw votes</h3>
              <p>
                People 65 and older cast <strong>{fmtM(over65)}</strong> votes in 2024. Everyone
                under 35, combined, cast <strong>{fmtM(under35)}</strong> — despite being the
                larger group of eligible voters.
              </p>
              <div className="voa-callout">
                <strong>{fmtM(over65)}</strong> votes from 65+ vs. <strong>{fmtM(under35)}</strong>{" "}
                from everyone 18–34.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
