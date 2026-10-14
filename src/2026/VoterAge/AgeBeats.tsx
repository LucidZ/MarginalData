import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PopulationBars, { goldSegments, type PopulationBarRow, type SummaryBar } from "./PopulationBars";
import StickyViz from "./StickyViz";
import RewindOverlay, { rewindHaze } from "./RewindOverlay";
import { useStepProgress } from "./useStepProgress";
import { cohortRows, hopRows } from "./ageRows";
import { fmtM, fmtPct, fmtPP } from "./format";
import {
  ageBeatsSteps,
  ageBeatsTitle,
  explorerCopy,
  midtermsTitle,
  rewindCopy,
  goldSummaryCopy,
  summaryTitle,
  rewindCardCopy,
  type AgeBeatsVals,
} from "./copy";
import type { VoterAgeData } from "./types";

/**
 * Beats 1 and 2, sharing one pinned chart.
 *
 * They used to be two <section>s with a StickyViz each, which meant the 2024
 * chart scrolled away at the end of beat 1 only for beat 2 to mount an
 * identical 2024 chart a few hundred pixels below - the reader watched a
 * chart leave and come back unchanged, and then read "this is the same chart
 * from beat one" underneath it. Beat 2's whole move is "hold this chart
 * still and change the election", which only lands if it is the same
 * physical element: one sticky pane, with beat 2's
 * heading riding up the text column while the chart stays put.
 *
 * Steps 0-3 accumulate the 2024 chart layer by layer, off a rounded step
 * index (the layer toggles are genuinely discrete, and each gets d3's
 * 700ms tween): eligible, votes, the 65+ turnout line, then the gold
 * shortfall under it and its total. That shortfall view is what the morph
 * carries: scrolling from step 3 to beat 2's step 4 rewinds it to the 2022
 * midterm, continuously
 * off the raw scroll fraction, with the tween disabled - see
 * .claude/voter-age-scroll-morph-spec.md and
 * .claude/voter-age-morph-honesty-spec.md. (The registration steps that used
 * to sit between the shortfall and the morph are at tag
 * `voter-age-registration-steps`.)
 *
 * Section 3 keeps the same pinned chart and goes back further. The scroll
 * rewinds it 2022 -> 2012 in the gold view, one year card and one cohort hop
 * per election, so the gold swelling in every midterm reads as a pattern.
 * At 2012 the columns merge into one gold-view bar and every election's bar
 * fades in beside it - the rewind's pattern in one picture - then each bar
 * shrinks to its gold as a share of votes cast, and an empty slot opens for
 * the 2026 midterm. That's the end of the story:
 * the vote call to action follows (App.tsx).
 * (A timed, auto-playing rewind was tried at `5e682ad` and dropped: one
 * mechanic going back and another going forward confused readers.)
 *
 * Earlier versions: a forward pass 2012 -> 2024 with the registered band,
 * then a counts summary and three gold-arrow midterm-drop beats, is at
 * `6bc657a`; a scroll-step-per-year rewind with no forward pass is at tag
 * `voter-age-full-rewind`; summary straight after 2022 is `a1f521b`.
 */

/** The first hop (2024 -> 2022) is measured from here: the 2024 shortfall
 * step, straight into beat 2's first step (2022) at MORPH_STEP + 1. (A
 * "no president on the ballot" step that used to sit between them was cut.) */
const MORPH_STEP = 3;
/** Beat 2's first step - its heading rides in with it. */
const MIDTERM_STEP = MORPH_STEP + 1;
/** The 65+ turnout standard's dotted line, on its own. */
const LINE_STEP = 2;
/** The gold shortfall under that line, and its total under the chart -
 * held through the morph and every hop after it. */
const TOTAL_STEP = 3;
/** Past this point the chart is scroll-driven, so d3's time tween is off. */
// Just short of the hop's start, so step 3's gold still tweens in.
const TWEEN_UNTIL = MORPH_STEP + 0.1;

/** Matches App.css's phone breakpoint, where the chart pins above the text. */
const PHONE_QUERY = "(max-width: 720px)";

/** Section 3's first step, resting on 2022: the rewind pass's first year
 * card. Then one step per election back to the first year. */
const REWIND_STEP = MORPH_STEP + 2;
/** Scroll fraction of a hop's step span spent resting at each end: the hop
 * runs over the middle 70%, same as beat 2 has always used. */
const HOP_MARGIN = 0.15;
/** Minimum move (in hops) before the clock's label flips direction, so a
 * small wobble in the scroll doesn't make it flicker. */
const DIRECTION_DEADZONE = 0.02;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Steepened ease-in-out: flat shoulders, fast middle, so the chart rests at
// the two real states and crosses between them quickly - a reader can still
// stop and reverse anywhere, it just takes intent. gamma=3 puts most of the
// change in the middle third. See .claude/voter-age-morph-honesty-spec.md S4a.
function ease(x: number, gamma = 3) {
  return x < 0.5 ? Math.pow(2 * x, gamma) / 2 : 1 - Math.pow(2 * (1 - x), gamma) / 2;
}

/** Every age that fell short of its cycle's 65+ standard, summed - the same
 * quantity the chart shades gold. */
const shortfallOf = (rows: { missing: number }[]) =>
  Math.abs(rows.reduce((s, r) => s + Math.min(0, r.missing), 0));

/** One election's card in section 3's rewind, outlined while the chart rests
 * on its year. */
function YearCard({
  year,
  kind,
  on,
  children,
}: {
  year: string;
  kind: "presidential" | "midterm";
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`voa-year-card voa-year-card--${kind}${on ? " is-on" : ""}`} data-year={year}>
      <div className="voa-year-card__head">
        <span className="voa-year-card__year">{year}</span>
        <span className="voa-year-card__kind">{kind === "midterm" ? explorerCopy.midterm : explorerCopy.presidential}</span>
      </div>
      <div className="voa-year-card__body">{children}</div>
    </div>
  );
}

export default function AgeBeats({ data }: { data: VoterAgeData }) {
  // Newest first: index 0 is 2024, the chart beat 1 builds. `pos` below
  // counts elections back from it.
  const years = useMemo(() => Object.keys(data.byAge).sort().reverse(), [data]);
  const hopCount = years.length - 1;
  /** The rewind pass's year cards, 2022 back to the first year; the first
   * rides on REWIND_STEP, then one hop per card. */
  const rewindYears = useMemo(() => years.slice(1), [years]);
  /** After the last rewind card, the gold-view summary: the first year's
   * columns merged into one bar; then every election's bar, each cut to its
   * gold as a share of votes cast; then an empty slot for the coming
   * midterm. The last step. */
  const GOLD_STEP = REWIND_STEP + rewindYears.length;
  const NEXT_STEP = GOLD_STEP + 2;
  const stepCount = NEXT_STEP + 1;

  // On phones the chart is pinned across the top, so the text a reader can
  // see is the band below it - measure steps against that band's middle.
  const sectionRef = useRef<HTMLElement>(null);
  const pinnedPane = () => sectionRef.current?.querySelector<HTMLElement>(".voa-scrolly-viz") ?? null;
  const coveredTop = useCallback(() => {
    if (!window.matchMedia(PHONE_QUERY).matches) return 0;
    const pane = pinnedPane();
    // `bottom`, not height: before the pane has stuck it covers less.
    return pane ? Math.min(Math.max(0, pane.getBoundingClientRect().bottom), window.innerHeight * 0.75) : 0;
  }, []);
  const { progress, activeStep: step, setStepRef } = useStepProgress(stepCount, coveredTop);
  const cycle2024 = data.byAge["2024"];
  const cycle2022 = data.byAge["2022"];

  // Each cycle's own 65+ rate - never hand-typed, straight from the data.
  // The dotted line is NOT pinned to 2024: it traces whichever cycle is
  // showing.
  const BENCH = cycle2024.over65Turnout; // 74.62
  const BENCH_2022 = cycle2022.over65Turnout; // 66.79

  // Rest state per year, keyed by cohort. Memoized so the d3 effect sees the
  // very same array for as long as the chart rests on a year - through all of
  // beat 1 that stops it re-firing a 700ms tween on every scroll quantum.
  const restRows = useMemo(() => years.map((y) => cohortRows(data.byAge[y], Number(y))), [data, years]);

  // Three independent channels driven off the same scroll span - do not
  // unify them (morph spec S2):
  //   u  - raw linear fraction within the current hop, drives the clock,
  //        the timeline dot and the chart haze (wants to read as a progress
  //        indicator: starts moving immediately, settles exactly when the
  //        hop completes).
  //   t  - eased version of u, drives bar/line geometry (steep middle so a
  //        reader crosses quickly and rests at the real years).
  //   printed numbers - snap off `shownIdx` (t<0.5), never off the lerped rows.
  // `pos` is how many hops back the chart is, continuously: 0 = 2024,
  // 1 = 2022, ..., hopCount = 2012. Hop spans never overlap, so summing
  // them is exact.
  // Rounded so float noise at a hop's edge (progress - start - margin
  // coming out 1e-16, not 0) can't read as "mid-hop" while the chart is
  // visibly at rest - every consumer tests u against exactly 0 and 1.
  // Same margins for every scroll-driven move: rest at each step, move in
  // between.
  const spanU = (from: number) =>
    Math.round(clamp01((progress - from - HOP_MARGIN) / (1 - 2 * HOP_MARGIN)) * 1e6) / 1e6;
  /** Beat 2's own hop - its delta line belongs to 2024 -> 2022 only. */
  const u0 = spanU(MORPH_STEP);

  // Section 3 rewinds by scroll, one hop per rewind card (2022 back to the
  // first year). (spanU(s) is the move from step s to step s + 1.)
  let back = 0;
  for (let k = 0; k < rewindYears.length - 1; k++) back += spanU(REWIND_STEP + k);
  const pos = u0 + back;
  const hop = Math.min(Math.floor(pos), hopCount - 1);
  const u = pos - hop;
  const t = ease(u);
  // The gold summary: merged in from the last rewind card to GOLD_STEP; on
  // the way to the next step the other bars are revealed (first half), then
  // cut to their gold as a percent (second half).
  const goldMerge = spanU(GOLD_STEP - 1);
  const goldAfter = spanU(GOLD_STEP);
  const goldReveal = clamp01(goldAfter * 2);
  const goldPct = clamp01(goldAfter * 2 - 1);
  const nextU = spanU(NEXT_STEP - 1);

  const activeRows = useMemo(() => {
    if (t <= 0) return restRows[hop];
    if (t >= 1) return restRows[hop + 1];
    return hopRows(restRows[hop], restRows[hop + 1], t);
  }, [restRows, hop, t]);

  // Which real election the LABELS describe. Everything printed reads from
  // this, never from activeRows (which mid-morph describes no election that
  // ever happened). See morph spec S2/S4c.
  const shownIdx = hop + (t >= 0.5 ? 1 : 0);
  const shownYear = years[shownIdx];
  const shownCycle = data.byAge[shownYear];
  const restingYear = u <= 0 ? years[hop] : u >= 1 ? years[hop + 1] : null;
  // Cohort keys make this a plain lookup: a hovered bar is the same people
  // in whichever year is shown, or nobody (a cohort not yet old enough).
  const shownRowsByKey = useMemo(() => new Map(restRows[shownIdx].map((r) => [r.key, r])), [restRows, shownIdx]);

  // Which way time is running, for the clock's label: scrolling down goes
  // back, scrolling up comes forward.
  const [direction, setDirection] = useState<"back" | "forward">("back");
  const lastPos = useRef(pos);
  useEffect(() => {
    const d = pos - lastPos.current;
    if (Math.abs(d) < DIRECTION_DEADZONE) return;
    setDirection(d > 0 ? "back" : "forward");
    lastPos.current = pos;
  }, [pos]);

  // Pinned across every cycle from first paint, so the axis never rescales -
  // not at a beat-1 layer reveal, and not under any hop.
  const yDomain = useMemo((): [number, number] => {
    const maxCvap = Math.max(...Object.values(data.byAge).flatMap((c) => c.rows.map((r) => r.cvap)));
    return [0, maxCvap * 1.08];
  }, [data]);

  // Each election's shortfall against its own 65+ rate - the gold, summed.
  const shortfalls = useMemo(
    () => Object.fromEntries(Object.entries(data.byAge).map(([y, c]) => [y, shortfallOf(c.rows)])),
    [data]
  );
  // The same shortfall as a share of that election's votes cast - the
  // figure on the rewind cards and the gold summary's percent bars.
  const shortfallPcts = useMemo(
    () => Object.fromEntries(Object.entries(data.byAge).map(([y, c]) => [y, (shortfalls[y] / c.totalVotes) * 100])),
    [data, shortfalls]
  );

  // One bar per election in the gold view, chronological, oldest left, each
  // election against its own 65+ rate. Summed from the same per-age pieces
  // the chart draws, so the merged bar is exactly its columns stacked.
  const goldBars = useMemo(
    (): SummaryBar[] =>
      [...years].reverse().map((y) => {
        const c = data.byAge[y];
        const segments: SummaryBar["segments"] = [0, 0, 0];
        for (const r of c.rows) goldSegments(r).forEach((v, s) => (segments[s] += v));
        return { key: y, kind: c.kind, segments };
      }),
    [data, years]
  );
  const goldFrom = years[years.length - 1];
  const summary = useMemo(
    () => ({
      bars: goldBars,
      layers: "shortfall" as const,
      from: goldFrom,
      merge: goldMerge,
      reveal: goldReveal,
      pct: { u: goldPct, values: shortfallPcts },
      pending: { key: goldSummaryCopy.nextYear, kind: "midterm" as const, u: nextU },
    }),
    [goldBars, goldFrom, goldMerge, goldReveal, goldPct, shortfallPcts, nextU]
  );

  const goldSummaryTooltip = useCallback(
    (bar: SummaryBar) => (
      <>
        <div className="voa-tooltip__head">
          {bar.key} · {bar.kind === "midterm" ? explorerCopy.midterm : explorerCopy.presidential}
        </div>
        <div>{fmtM(bar.segments[0] + bar.segments[1] + bar.segments[2])} eligible</div>
        <div>
          {fmtM(bar.segments[1])} short of the 65+ rate ({fmtPct(shortfallPcts[bar.key])} of votes cast)
        </div>
        <div>{fmtM(bar.segments[0])} voted</div>
      </>
    ),
    [shortfallPcts]
  );

  const shortfall2024 = shortfalls["2024"];
  const shortfall2022 = shortfalls["2022"];

  // Shortfall % ranges by election type, for the gold summary's copy.
  const goldVals = useMemo(() => {
    const pctRange = (kind: string) => {
      const v = Object.entries(data.byAge)
        .filter(([, c]) => c.kind === kind)
        .map(([y]) => shortfallPcts[y]);
      return `${fmtPct(Math.min(...v))}–${fmtPct(Math.max(...v))}`;
    };
    return {
      midtermPcts: pctRange("midterm"),
      presidentialPcts: pctRange("presidential"),
    };
  }, [data, shortfallPcts]);

  const under35Missing = shortfallOf(cycle2024.rows.filter((r) => r.age < 35));

  const age25 = cycle2024.rows.find((r) => r.age === 25)!;
  const age75 = cycle2024.rows.find((r) => r.age === 75)!;

  // Tooltip content snaps the same as every other printed number - a hovered
  // bar mid-morph describes `shown`, not the lerped geometry it happens to
  // be sitting on. useCallback because PopulationBars lists this in its d3
  // effect deps, and this component now re-renders on every scroll quantum.
  // Mid-morph the bars describe no real election, so there is nothing
  // honest to hover - no tooltip until the chart settles on a real year.
  const morphing = t > 0 && t < 1;
  const tooltipFor = useCallback(
    (row: PopulationBarRow) => {
      if (morphing) return null;
      const real = shownRowsByKey.get(row.key);
      if (!real) return null; // a cohort that has slid off the chart
      const year = shownYear;
      return (
        <>
          <div className="voa-tooltip__head">
            Age {real.label} · {year}
            {real.ratesPooled ? " (rate shared across 80-84/85+)" : ""}
          </div>
          {fmtM(real.cvap)} eligible
          {` · ${fmtM(real.votes)} voted (${fmtPct(real.turnout)})`}
          {step >= LINE_STEP && (
            <div className="voa-tooltip__note">
              At the {year} 65+ rate ({fmtPct(shownCycle.over65Turnout)}): {fmtM(real.expected)}
            </div>
          )}
        </>
      );
    },
    [morphing, shownRowsByKey, shownYear, shownCycle, step]
  );

  const stepRef = setStepRef;

  // Running header on the pinned chart: once the section's own title has
  // scrolled off the top, the current numbered section's title rides with
  // the chart until the next one replaces it.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [titleGone, setTitleGone] = useState(false);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) =>
      setTitleGone(!e.isIntersecting && e.boundingClientRect.top < 0)
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const runningTitle = step < MIDTERM_STEP ? ageBeatsTitle : step < REWIND_STEP ? midtermsTitle : summaryTitle;

  const copyVals: AgeBeatsVals = {
    age25cvap: fmtM(age25.cvap),
    age75cvap: fmtM(age75.cvap),
    bench: fmtPct(BENCH),
    bench2022: fmtPct(BENCH_2022),
    crossoverAge: cycle2024.crossoverAge,
    shortfall2024: fmtM(shortfall2024),
    under35Missing: fmtM(under35Missing),
    shortfall2024Pct: fmtPct(shortfallPcts["2024"]),
    shortfall2022: fmtM(shortfall2022),
    shortfall2022Pct: fmtPct(shortfallPcts["2022"]),
  };

  return (
    <section className="voa-beat" ref={sectionRef}>
      <h2 className="voa-beat-title" ref={titleRef}>{ageBeatsTitle}</h2>
      <div className="voa-scrolly">
        <StickyViz>
          {/* Always mounted, so its space is reserved and fading in moves
              nothing. Keyed so each new title fades in on its own. */}
          <div className="voa-running-title" style={{ opacity: titleGone ? 1 : 0 }} aria-hidden="true">
            <span key={runningTitle}>{runningTitle}</span>
          </div>
          {/* Scroll state for tests: pos = hops back from 2024, u = within the
              current hop, u0 = within beat 2's hop (2024 -> 2022) only. */}
          <span
            className="voa-morph-state"
            data-pos={pos.toFixed(4)}
            data-u={u.toFixed(4)}
            data-u0={u0.toFixed(4)}
            data-shown={shownYear}
            data-resting={restingYear ?? ""}
            hidden
          />
          <PopulationBars
            rows={activeRows}
            xKind="age"
            xLabel={goldMerge >= 0.5 ? goldSummaryCopy.xLabel : "Age"}
            // Swaps as the percent axis starts to fade in.
            yLabel={goldPct >= 0.8 ? goldSummaryCopy.pctYLabel : "People (millions)"}
            showTrack
            showVotes={step >= 1}
            // The dotted line has no counterpart on the summary bars - it
            // and its legend entry go as the merge starts.
            expectedOpacity={step >= LINE_STEP ? 1 - clamp01(goldMerge / 0.15) : 0}
            gapOpacity={step >= TOTAL_STEP ? 1 : 0}
            gapLegendLabel="Shortfall"
            // Traces whichever cycle is shown, so its rate follows the morph.
            expectedLineLabel={`at 65+ turnout (${fmtPct(shownCycle.over65Turnout)})`}
            heroGap={{
              // Snaps to the shown election's own figure - never one read off
              // lerped rows.
              items: [
                {
                  figure: fmtPct(shortfallPcts[shownYear]),
                  label: "shortfall, as a share of votes cast",
                  delta: fmtPP(shortfallPcts["2022"] - shortfallPcts["2024"]),
                  tone: "gap",
                },
              ],
              // Mounted from first paint (so the space it takes is reserved
              // and its arrival moves nothing), faded in as the reader
              // reaches the step that adds the gold up. Dimmed with the plot
              // mid-morph: a crisp number under a rewinding chart still
              // invites reading it as the chart's.
              opacity:
                clamp01((progress - (TOTAL_STEP - 0.45)) / 0.35) *
                (1 - 0.65 * rewindHaze(u)) *
                // Out for the rewind: each rewind card carries its year's
                // shortfall, so the figure here would only repeat it.
                (1 - clamp01((progress - (REWIND_STEP - 0.45)) / 0.35)),
              // Fades in over beat 2's hop's last ~15%. Keyed to raw `u`, the
              // linear scroll signal, not the eased `t` (whose last 15% is a
              // much narrower sliver of actual scroll distance). The delta is
              // 2024 -> 2022 only: it fades back out as the next hop starts,
              // since a change vs. the previous election would mix election
              // types.
              // Gone for good once the rewind starts.
              deltaOpacity: clamp01((u0 - 0.85) / 0.15) * (1 - clamp01(back / 0.15)),
            }}
            yDomain={yDomain}
            // Off once the chart is scroll-driven: a time tween there fights
            // the scroll instead of following it.
            transitionMs={progress > TWEEN_UNTIL ? 0 : 700}
            tooltipFor={tooltipFor}
            summary={summary}
            summaryTooltip={goldSummaryTooltip}
            // On mid-hop only.
            plotOverlay={
              <RewindOverlay
                opacity={rewindHaze(u)}
                direction={direction}
                label={direction === "back" ? explorerCopy.rewinding : explorerCopy.fastForwarding}
                year={shownYear}
              />
            }
            plotHaze={rewindHaze(u)}
          />
        </StickyViz>
        <div className="voa-scrolly-steps">
          {ageBeatsSteps.map((s, i) => (
            <div className="voa-step" key={i} ref={stepRef(i)}>
              <div className="voa-step-inner">
                {i === MIDTERM_STEP && (
                  // Beat 2 starts here. Visually hidden: the running title on
                  // the pinned chart is the visible header (it's aria-hidden,
                  // so this one carries the outline).
                  <h2 className="voa-beat-title voa-beat-title--incolumn">{midtermsTitle}</h2>
                )}
                <h3>{typeof s.heading === "function" ? s.heading(copyVals) : s.heading}</h3>
                {s.body(copyVals)}
              </div>
            </div>
          ))}
          {rewindYears.map((year, k) => {
            const c = data.byAge[year];
            return (
              <div className="voa-step" key={`rew-${year}`} ref={stepRef(REWIND_STEP + k)}>
                <div className="voa-step-inner">
                  {k === 0 && (
                    <>
                      <h2 className="voa-beat-title voa-beat-title--incolumn">{summaryTitle}</h2>
                      <h3>{rewindCopy.heading({ firstYear: goldFrom })}</h3>
                      {rewindCopy.body()}
                    </>
                  )}
                  <YearCard year={year} kind={c.kind} on={year === restingYear && step >= REWIND_STEP && step < GOLD_STEP}>
                    {rewindCardCopy(year, { shortfallPct: fmtPct(shortfallPcts[year]) })}
                  </YearCard>
                </div>
              </div>
            );
          })}
          <div className="voa-step" ref={stepRef(GOLD_STEP)}>
            <div className="voa-step-inner">
              <h3>{goldSummaryCopy.mergeHeading}</h3>
              {goldSummaryCopy.merge({ year: goldFrom })}
            </div>
          </div>
          <div className="voa-step" ref={stepRef(GOLD_STEP + 1)}>
            <div className="voa-step-inner">
              <h3>{goldSummaryCopy.pctHeading}</h3>
              {goldSummaryCopy.pct(goldVals)}
            </div>
          </div>
          <div className="voa-step voa-step--end" ref={stepRef(NEXT_STEP)}>
            <div className="voa-step-inner">
              <h3>{goldSummaryCopy.nextHeading}</h3>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
