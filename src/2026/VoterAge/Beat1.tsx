import { useMemo, useRef } from "react";
import AgeScatter, { type ScatterPoint, type GapBracket } from "./AgeScatter";
import { useScrollProgress, stepFromProgress } from "./useScrollProgress";
import { fmtM, fmtPct, fmtPP, findCrossoverAge } from "./format";
import type { VoterAgeData, SingleYearRow } from "./types";

const STEP_COUNT = 8;
const EXAMPLE_OLD_AGE = 70;
const EXAMPLE_YOUNG_AGE = 20;

function seqT(age: number) {
  return (age - 18) / (87 - 18);
}

function toPoint(row: SingleYearRow): ScatterPoint {
  return { key: `age-${row.age}`, x: row.shareElig, y: row.shareVote, seqT: seqT(row.age), r: 4 };
}

export default function Beat1({ data }: { data: VoterAgeData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(containerRef);
  const step = stepFromProgress(progress, STEP_COUNT);

  const cycle2024 = data.nationalByBin.find((c) => c.year === 2024)!;
  const crossoverAge = useMemo(() => findCrossoverAge(data.nationalByYearOfAge), [data]);

  const oldRow = data.nationalByYearOfAge.find((r) => r.age === EXAMPLE_OLD_AGE)!;
  const youngRow = data.nationalByYearOfAge.find((r) => r.age === EXAMPLE_YOUNG_AGE)!;
  const oldGap = oldRow.shareVote - oldRow.shareElig;
  const youngGap = youngRow.shareVote - youngRow.shareElig;

  // A domain that comfortably fits both example points from the start, so
  // steps a-d share one frame instead of rescaling as the second point
  // (and later the diagonal->horizontal transform) appears.
  const exampleDomain = useMemo((): [number, number] => {
    const values = [oldRow.shareElig, oldRow.shareVote, youngRow.shareElig, youngRow.shareVote];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.3;
    return [Math.max(0, lo - pad), hi + pad];
  }, [oldRow, youngRow]);

  // Full single-year gap dataset + a stable age/gap domain, computed once
  // so the axes don't rescale again between the transform step and the
  // full reveal - only the dots appear.
  const allGapPoints = useMemo(
    () =>
      data.nationalByYearOfAge.map((row) => ({
        key: `age-${row.age}`,
        age: row.age,
        gap: row.shareVote - row.shareElig,
      })),
    [data]
  );
  const gapXDomain = useMemo((): [number, number] => {
    const ages = allGapPoints.map((p) => p.age);
    return [Math.min(...ages) - 3, Math.max(...ages) + 3];
  }, [allGapPoints]);
  const gapYDomain = useMemo((): [number, number] => {
    const gaps = allGapPoints.map((p) => p.gap);
    const lo = Math.min(...gaps);
    const hi = Math.max(...gaps);
    const pad = (hi - lo) * 0.15;
    return [lo - pad, hi + pad];
  }, [allGapPoints]);

  const oldGapPoint: ScatterPoint = { key: `age-${EXAMPLE_OLD_AGE}`, x: EXAMPLE_OLD_AGE, y: oldGap, seqT: seqT(EXAMPLE_OLD_AGE), r: 7 };
  const youngGapPoint: ScatterPoint = { key: `age-${EXAMPLE_YOUNG_AGE}`, x: EXAMPLE_YOUNG_AGE, y: youngGap, seqT: seqT(EXAMPLE_YOUNG_AGE), r: 7 };
  const allGapScatterPoints: ScatterPoint[] = allGapPoints.map((p) => ({
    key: p.key,
    x: p.age,
    y: p.gap,
    seqT: seqT(p.age),
    r: 4,
  }));

  const oldPoint = toPoint(oldRow);
  const youngPoint = toPoint(youngRow);

  // ---- Per-step content ----
  let points: ScatterPoint[] = [];
  let gapBrackets: GapBracket[] | undefined;
  let mode: "proportional" | "gap" = "proportional";
  let domain: [number, number] | undefined = exampleDomain;

  if (step === 0) {
    points = [];
    domain = undefined; // empty intro, default [0,35]
  } else if (step === 1) {
    points = [oldPoint];
  } else if (step === 2) {
    points = [oldPoint];
    gapBrackets = [
      { x: oldRow.shareElig, y: oldRow.shareVote, label: `+${oldGap.toFixed(2)}pp overrepresented` },
    ];
  } else if (step === 3) {
    points = [oldPoint, youngPoint];
    gapBrackets = [
      { x: oldRow.shareElig, y: oldRow.shareVote, label: `+${oldGap.toFixed(2)}pp overrepresented` },
    ];
  } else if (step === 4) {
    points = [oldPoint, youngPoint];
    gapBrackets = [
      { x: oldRow.shareElig, y: oldRow.shareVote, label: `+${oldGap.toFixed(2)}pp overrepresented` },
      { x: youngRow.shareElig, y: youngRow.shareVote, label: `${youngGap.toFixed(2)}pp underrepresented` },
    ];
  } else if (step === 5) {
    mode = "gap";
    points = [oldGapPoint, youngGapPoint];
  } else {
    mode = "gap";
    points = allGapScatterPoints;
  }

  const crossoverAnnotation =
    step >= 6 && crossoverAge != null
      ? {
          x: crossoverAge,
          y: allGapPoints.find((p) => p.age === crossoverAge)?.gap ?? 0,
          text: `~age ${crossoverAge}: crossover`,
          dx: 14,
          dy: -18,
        }
      : null;

  const under35 = cycle2024.bins["18-24"].voted + cycle2024.bins["25-34"].voted;
  const over65 = cycle2024.bins["65+"].voted;

  return (
    <section className="voa-beat" ref={containerRef}>
      <h2 className="voa-beat-title">Beat 1 — Turnout by age</h2>
      <div className="voa-scrolly">
        <div className="voa-scrolly-viz">
          {mode === "proportional" ? (
            <AgeScatter points={points} fixedDomain={domain} gapBrackets={gapBrackets} />
          ) : (
            <AgeScatter
              points={points}
              xDomain={gapXDomain}
              yDomain={gapYDomain}
              xLabel="Age"
              yLabel="Over/under representation (pp)"
              xTickFormat={(d) => `${d}`}
              yTickFormat={(d) => fmtPP(d, 1)}
              annotation={crossoverAnnotation}
              defaultRadius={4}
            />
          )}
        </div>
        <div className="voa-scrolly-steps">
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>One person, one vote — but not one turnout rate</h3>
              <p>
                If every age group voted at the same rate, its dot would land exactly on this
                dashed line: its share of votes cast would match its share of eligible voters.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>Start with one age</h3>
              <p>
                Here's a single point: {EXAMPLE_OLD_AGE}-year-olds in the 2024 election. They're{" "}
                <strong>{fmtPct(oldRow.shareElig)}</strong> of eligible citizens, and cast{" "}
                <strong>{fmtPct(oldRow.shareVote)}</strong> of votes.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>Above the line</h3>
              <p>
                That point sits above the dashed line. The gap between them —{" "}
                <strong>{fmtPP(oldGap)}</strong> — is overrepresentation: {EXAMPLE_OLD_AGE}
                -year-olds cast a slightly larger share of votes than their share of the
                population.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>Now a younger age</h3>
              <p>
                Here's a {EXAMPLE_YOUNG_AGE}-year-old: <strong>{fmtPct(youngRow.shareElig)}</strong>{" "}
                of eligible citizens, only <strong>{fmtPct(youngRow.shareVote)}</strong> of votes.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>Below the line</h3>
              <p>
                This point sits below the line: <strong>{fmtPP(youngGap)}</strong> of
                underrepresentation. Same line, same units, opposite direction.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>Make the gap the whole chart</h3>
              <p>
                That vertical distance — how far above or below the line each point sits — is the
                real story. Let's put it on its own axis: age across the bottom, over- or
                underrepresentation in percentage points up and down.
              </p>
            </div>
          </div>
          <div className="voa-step">
            <div className="voa-step-inner">
              <h3>Every age, all at once</h3>
              <p>
                Here's every single year of age, 18 through 85+, on the same scale. Somewhere
                around <strong>age {crossoverAge ?? "40"}</strong>, the line crosses zero — below
                it you're outnumbered relative to your share of the electorate; above it, you're
                overrepresented.
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
