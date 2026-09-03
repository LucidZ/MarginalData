import { useMemo, useRef } from "react";
import StateGrid from "./StateGrid";
import MailTrend, { type TrendSeries } from "./MailTrend";
import { useScrollProgress, stepFromProgress } from "./useScrollProgress";
import { fmtPP } from "./format";
import type { VoterAgeData } from "./types";

const TREND_STEP_COUNT = 4;
const YEARS = [2016, 2020, 2024];

export default function Beat4({ data }: { data: VoterAgeData }) {
  // The 2024 cross-section map doesn't change across its two text steps
  // (same pattern as Beat3) - only the trend chart below needs step-driven
  // reveal, so only its progress is tracked.
  const gridRef = useRef<HTMLDivElement>(null);

  const trendRef = useRef<HTMLDivElement>(null);
  const trendProgress = useScrollProgress(trendRef);
  const trendStep = stepFromProgress(trendProgress, TREND_STEP_COUNT);

  const cross = data.derived.mailCrossSection2024;
  const cross2024Values = data.states.map((s) => s.under35Gap2024 ?? 0);
  const domain2024 = useMemo((): [number, number] => {
    return [Math.min(...cross2024Values), Math.max(...cross2024Values)];
  }, [cross2024Values]);

  const outperformers = data.states
    .filter((s) => s.mailStatus === "never" && (s.under35Gap2024 ?? -Infinity) > cross.mailMean)
    .sort((a, b) => (b.under35Gap2024 ?? 0) - (a.under35Gap2024 ?? 0))
    .slice(0, 4);

  // Natural-experiment series, from the build-time-derived stats (no
  // hand-typed numbers - see scripts/generate_voter_age_data.py).
  const ne = data.derived.naturalExperiment;
  const permanentStates = data.states.filter(
    (s) => s.mailStatus === "permanent-pre2016" || s.mailStatus === "permanent-post2020"
  );
  const permanentByYear = (year: number) =>
    permanentStates.reduce((sum, s) => sum + (s.years[String(year)]?.under35Gap ?? 0), 0) /
    permanentStates.length;

  const series: TrendSeries[] = [
    {
      key: "never",
      label: "never-mail",
      color: "var(--muted)",
      values: YEARS.map((y) => ({ year: y, gap: ne.neverMailMeanByYear[String(y)] })),
    },
    {
      key: "permanent",
      label: "permanent adopters",
      color: "var(--series-1)",
      values: YEARS.map((y) => ({ year: y, gap: permanentByYear(y) })),
    },
    {
      key: "nj",
      label: "New Jersey",
      color: "var(--series-2)",
      values: YEARS.map((y) => ({ year: y, gap: ne.newJersey.gapByYear[String(y)] })),
    },
    {
      key: "mt",
      label: "Montana",
      color: "var(--series-3)",
      values: YEARS.map((y) => ({ year: y, gap: ne.montana.gapByYear[String(y)] })),
    },
  ];
  const visibleKeys = new Set(series.slice(0, trendStep + 1).map((s) => s.key));

  return (
    <>
      <section className="voa-beat" ref={gridRef}>
        <h2 className="voa-beat-title">Beat 4 — Does mail-in voting help?</h2>
        <div className="voa-scrolly">
          <div className="voa-scrolly-viz">
            <StateGrid
              states={data.states}
              valueFor={(s) => s.under35Gap2024}
              domain={domain2024}
              highlightMail
              legendCaption="2024 only"
            />
          </div>
          <div className="voa-scrolly-steps">
            <div className="voa-step">
              <div className="voa-step-inner">
                <h3>The obvious hypothesis</h3>
                <p>
                  If ballot access is the barrier, universal mail voting should help — no trip to
                  a polling place required. All-mail states average{" "}
                  <strong>{fmtPP(cross.mailMean)}</strong> vs.{" "}
                  <strong>{fmtPP(cross.neverMean)}</strong> everywhere else. Directionally right.
                </p>
              </div>
            </div>
            <div className="voa-step">
              <div className="voa-step-inner">
                <h3>But not a clean pattern</h3>
                <p>
                  That difference isn't statistically significant (Welch's t ={" "}
                  {cross.welchT.toFixed(2)}, {cross.nMail} mail states vs. {cross.nNever} others).{" "}
                  {outperformers.map((s) => s.state).join(", ")} — none of them all-mail —
                  outperform most all-mail states. This isn't "no effect": a gap this size (
                  {fmtPP(cross.mailMean - cross.neverMean)}) could matter in a close election. The
                  problem is precision, not necessarily size.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="voa-beat" ref={trendRef}>
        <h2 className="voa-beat-title">Beat 4b — A state that switched on, then off</h2>
        <div className="voa-scrolly">
          <div className="voa-scrolly-viz">
            <MailTrend series={series} visibleKeys={visibleKeys} years={YEARS} />
          </div>
          <div className="voa-scrolly-steps">
            <div className="voa-step">
              <div className="voa-step-inner">
                <h3>The baseline</h3>
                <p>
                  40 states never went all-mail. Their average gap barely moves across three
                  presidential cycles: {fmtPP(ne.neverMailMeanByYear["2016"])} in 2016,{" "}
                  {fmtPP(ne.neverMailMeanByYear["2024"])} in 2024.
                </p>
              </div>
            </div>
            <div className="voa-step">
              <div className="voa-step-inner">
                <h3>States that adopted and stayed</h3>
                <p>
                  California, Nevada, Vermont, Hawaii, Utah, and DC went all-mail (mostly around
                  2020) and never reverted. Their average improved — but so did the never-mail
                  baseline over the same years, since national turnout itself shifted between
                  2016 and 2020.
                </p>
              </div>
            </div>
            <div className="voa-step">
              <div className="voa-step-inner">
                <h3>New Jersey: on, then off</h3>
                <p>
                  New Jersey mailed every registered voter a ballot for 2020 only, then reverted.
                  Against the never-mail baseline, that's a{" "}
                  <strong>{fmtPP(ne.newJersey.didOnSwitch2020)}</strong> shift when the policy
                  switched on, and <strong>{fmtPP(ne.newJersey.didOffSwitch2024)}</strong> when it
                  switched back off. Mean reversion alone can't explain a reversal — a state
                  starting where NJ started would be predicted to keep improving.
                </p>
              </div>
            </div>
            <div className="voa-step">
              <div className="voa-step-inner">
                <h3>Montana: the same shape, weaker</h3>
                <p>
                  Montana let counties opt into all-mail for 2020. Same pattern (
                  <strong>{fmtPP(ne.montana.didOnSwitch2020)}</strong> on), but a much weaker
                  reversal (<strong>{fmtPP(ne.montana.didOffSwitch2024)}</strong> off) — n=2 here,
                  so treat this as suggestive, not proof. And a placebo check on Colorado/Oregon/
                  Washington (already all-mail before 2016, which should show ~0 change) still
                  drifted {fmtPP(data.derived.placeboAlwaysMailPre2016.meanChange2016to2024)},
                  an unexplained residual that applies to all of this comparison.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
