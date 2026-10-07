import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PopulationBars, { stackSegments, type PopulationBarRow, type SummaryBar } from "./PopulationBars";
import StickyViz from "./StickyViz";
import RewindOverlay, { rewindHaze } from "./RewindOverlay";
import { useStepProgress } from "./useStepProgress";
import { cohortRows, hopRows } from "./ageRows";
import { fmtM, fmtMSigned, fmtPct } from "./format";
import {
  ageBeatsSteps,
  ageBeatsTitle,
  explorerCopy,
  midtermDropSteps,
  midtermsTitle,
  summaryCopy,
  summaryTitle,
  type AgeBeatsVals,
  type MidtermDropVals,
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
 * physical element: one sticky pane spanning eight steps, with beat 2's
 * heading riding up the text column while the chart stays put.
 *
 * Steps 0-3 accumulate the 2024 chart layer by layer, off a rounded step
 * index (the layer toggles are genuinely discrete, and each gets d3's
 * 700ms tween): eligible, votes, the 65+ turnout line, then the gold
 * shortfall under it and its total. That shortfall view is what the morph
 * carries: beat 2 (steps 4-5) rewinds it to the 2022 midterm, continuously
 * off the raw scroll fraction, with the tween disabled - see
 * .claude/voter-age-scroll-morph-spec.md and
 * .claude/voter-age-morph-honesty-spec.md. (The registration steps that used
 * to sit between the shortfall and the morph are at tag
 * `voter-age-registration-steps`.)
 *
 * Section 3 keeps the same pinned chart: the gold fades and 2022's age
 * columns recolour into three plain counts (votes, registered, eligible - no
 * 65+ standard) and merge into one stacked bar, each column's segments
 * flying into their slice of the total; then the other elections' bars fade
 * in around it, one bar per election. Then three beats of gold arrows, each
 * presidential election to the midterm after it: eligible, registered, votes.
 *
 * Every other year by age lives in the explorer after the story
 * (Explorer.tsx). The scroll used to rewind through all of them, one hop
 * per election, before the merge - that version is at tag
 * `voter-age-full-rewind`.
 */

/** Index of beat 2's first step - the first hop (2024 -> 2022) is measured from here. */
const MORPH_STEP = 4;
/** The 65+ turnout standard's dotted line, on its own. */
const LINE_STEP = 2;
/** The gold shortfall under that line, and its total under the chart -
 * held through the morph and every hop after it. */
const TOTAL_STEP = 3;
/** Past this point the chart is scroll-driven, so d3's time tween is off. */
const TWEEN_UNTIL = MORPH_STEP - 0.6;

/** Matches App.css's phone breakpoint, where the chart pins above the text. */
const PHONE_QUERY = "(max-width: 720px)";

/** Step whose centre each hop starts from. Only one hop now: beat 2's,
 * 2024 -> 2022. */
const hopStart = (h: number) => MORPH_STEP + h;
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

export default function AgeBeats({ data }: { data: VoterAgeData }) {
  // Newest first. The scroll only visits the first two: 2024, the chart
  // beat 1 builds, and 2022, beat 2's hop. Every election feeds the summary.
  const allYears = useMemo(() => Object.keys(data.byAge).sort().reverse(), [data]);
  const years = useMemo(() => allYears.slice(0, 2), [allYears]);
  const hopCount = years.length - 1;
  /** First summary step: the merged 2022 bar. The merge runs from beat 2's
   * last step to this one, the reveal from this one to the next. */
  const SUMMARY_STEP = MORPH_STEP + 1 + hopCount;
  /** Then one step per gold-arrow beat: eligible, registered, votes. */
  const DROP_STEP = SUMMARY_STEP + 2;
  const stepCount = DROP_STEP + midtermDropSteps.length;

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
  const hopU = (h: number) =>
    Math.round(clamp01((progress - hopStart(h) - HOP_MARGIN) / (1 - 2 * HOP_MARGIN)) * 1e6) / 1e6;
  let pos = 0;
  for (let h = 0; h < hopCount; h++) pos += hopU(h);
  const hop = Math.min(Math.floor(pos), hopCount - 1);
  const u = pos - hop;
  const t = ease(u);
  /** Beat 2's own hop - its delta line belongs to 2024 -> 2022 only. */
  const u0 = hopU(0);
  // Same margins as a hop: rest at each step, move in between.
  const spanU = (from: number) =>
    Math.round(clamp01((progress - from - HOP_MARGIN) / (1 - 2 * HOP_MARGIN)) * 1e6) / 1e6;
  const mergeU = spanU(SUMMARY_STEP - 1);
  const revealU = spanU(SUMMARY_STEP);

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

  // Chronological, oldest left. Summed from the same per-age pieces the
  // chart draws, so the merged bar is exactly its columns stacked.
  const mergeYear = years[hopCount];
  const summaryBars = useMemo(
    (): SummaryBar[] =>
      [...allYears].reverse().map((y) => {
        const c = data.byAge[y];
        const segments: SummaryBar["segments"] = [0, 0, 0];
        for (const r of c.rows) stackSegments(r).forEach((v, s) => (segments[s] += v));
        return { key: y, kind: c.kind, segments };
      }),
    [data, allYears]
  );
  // Each presidential election paired with the midterm right after it.
  const dropPairs = useMemo(
    () =>
      summaryBars.flatMap((b, i) => {
        const next = summaryBars[i + 1];
        return b.kind === "presidential" && next?.kind === "midterm" ? [{ from: b, to: next }] : [];
      }),
    [summaryBars]
  );
  // Layer = segments summed from the bottom: votes, registered, eligible.
  // Beat order is eligible (3), registered (2), votes (1).
  const DROP_LAYERS = [3, 2, 1];
  const topOf = (b: SummaryBar, layer: number) => b.segments.slice(0, layer).reduce((a, v) => a + v, 0);
  const dropStats = DROP_LAYERS.map((layer) => {
    const per = dropPairs.map(({ from, to }) => ({
      diff: topOf(to, layer) - topOf(from, layer),
      pct: (topOf(to, layer) / topOf(from, layer) - 1) * 100,
    }));
    const n = Math.max(1, per.length);
    return {
      per,
      avgDiff: per.reduce((a, p) => a + p.diff, 0) / n,
      avgPct: per.reduce((a, p) => a + p.pct, 0) / n,
    };
  });
  const signedPct = (v: number) => `${v >= 0 ? "+" : "\u2212"}${fmtPct(Math.abs(v))}`;
  // Each beat's arrows fade in as its step arrives and out as the next one
  // does, so only one layer is ever marked.
  const dropOpacity = (i: number) => {
    const s = DROP_STEP + i;
    const fadeIn = clamp01((progress - (s - 0.45)) / 0.35);
    const fadeOut = i === DROP_LAYERS.length - 1 ? 0 : clamp01((progress - (s + 0.55)) / 0.35);
    return fadeIn * (1 - fadeOut);
  };
  // Joined into a string so the memo (and with it the d3 effect) only
  // re-fires when an opacity actually changes.
  const arrowOpacityKey = DROP_LAYERS.map((_, i) => dropOpacity(i).toFixed(3)).join(",");
  const arrows = useMemo(
    () =>
      DROP_LAYERS.map((layer, i) => ({
        layer,
        opacity: Number(arrowOpacityKey.split(",")[i]),
        pairs: dropPairs.map(({ from, to }, k) => ({
          from: from.key,
          to: to.key,
          label: signedPct(dropStats[i].per[k].pct),
        })),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dropPairs, arrowOpacityKey]
  );
  const summary = useMemo(
    () => ({ bars: summaryBars, from: mergeYear, merge: mergeU, reveal: revealU, arrows }),
    [summaryBars, mergeYear, mergeU, revealU, arrows]
  );
  const [eligibleDrop, registeredDrop, votesDrop] = dropStats;
  const dropVals: MidtermDropVals = {
    pairs: dropPairs.length,
    eligiblePct: signedPct(eligibleDrop.avgPct),
    registeredPct: fmtPct(Math.abs(registeredDrop.avgPct)),
    registeredM: fmtM(Math.abs(registeredDrop.avgDiff)),
    votesPct: fmtPct(Math.abs(votesDrop.avgPct)),
    votesM: fmtM(Math.abs(votesDrop.avgDiff)),
    ratio: Math.round(votesDrop.avgDiff / registeredDrop.avgDiff).toString(),
  };
  const summaryTooltip = useCallback(
    (bar: SummaryBar) => (
      <>
        <div className="voa-tooltip__head">
          {bar.key} · {bar.kind === "midterm" ? explorerCopy.midterm : explorerCopy.presidential}
        </div>
        {/* Cumulative, top-down: each figure is a stack top, not a band. */}
        <div>{fmtM(bar.segments[0] + bar.segments[1] + bar.segments[2])} eligible</div>
        <div>{fmtM(bar.segments[0] + bar.segments[1])} registered</div>
        <div>{fmtM(bar.segments[0])} voted</div>
      </>
    ),
    []
  );

  // Each election's shortfall against its own 65+ rate - the gold, summed.
  const shortfalls = useMemo(
    () => Object.fromEntries(Object.entries(data.byAge).map(([y, c]) => [y, shortfallOf(c.rows)])),
    [data]
  );
  const shortfall2024 = shortfalls["2024"];
  const shortfall2022 = shortfalls["2022"];

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

  const copyVals: AgeBeatsVals = {
    age25cvap: fmtM(age25.cvap),
    age75cvap: fmtM(age75.cvap),
    bench: fmtPct(BENCH),
    bench2022: fmtPct(BENCH_2022),
    crossoverAge: cycle2024.crossoverAge,
    shortfall2024: fmtM(shortfall2024),
    under35Missing: fmtM(under35Missing),
    shortfall2024Pct: fmtPct((shortfall2024 / cycle2024.totalVotes) * 100),
    shortfall2022: fmtM(shortfall2022),
    shortfall2022Pct: fmtPct((shortfall2022 / cycle2022.totalVotes) * 100),
  };

  return (
    <section className="voa-beat" ref={sectionRef}>
      <h2 className="voa-beat-title">{ageBeatsTitle}</h2>
      <div className="voa-scrolly">
        <StickyViz>
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
            xLabel={mergeU >= 0.5 ? summaryCopy.xLabel : "Age"}
            yLabel="People (millions)"
            showTrack
            showVotes={step >= 1}
            // The dotted line and the gold have no counterpart on the summary
            // bars - they and their legend entries go as the merge starts.
            expectedOpacity={step >= LINE_STEP ? 1 - clamp01(mergeU / 0.3) : 0}
            gapOpacity={step >= TOTAL_STEP ? 1 - clamp01(mergeU / 0.3) : 0}
            gapLegendLabel="Shortfall"
            // Traces whichever cycle is shown, so its rate follows the morph.
            expectedLineLabel={`at 65+ turnout (${fmtPct(shownCycle.over65Turnout)})`}
            heroGap={{
              // Snaps to the shown election's own figure - never one read off
              // lerped rows.
              items: [
                {
                  figure: fmtM(shortfalls[shownYear]),
                  label: "fewer votes than the 65+ rate",
                  delta: fmtMSigned(shortfall2022 - shortfall2024),
                  tone: "gap",
                },
              ],
              // Mounted from first paint (so the space it takes is reserved
              // and its arrival moves nothing), faded in as the reader
              // reaches the step that adds the gold up. Dimmed with the plot
              // mid-morph: a crisp number under a rewinding chart still
              // invites reading it as the chart's. Gone as the columns merge.
              opacity:
                clamp01((progress - (TOTAL_STEP - 0.45)) / 0.35) *
                (1 - 0.65 * rewindHaze(u)) *
                (1 - clamp01(mergeU / 0.15)),
              // Fades in over beat 2's hop's last ~15%. Keyed to raw `u`, the
              // linear scroll signal, not the eased `t` (whose last 15% is a
              // much narrower sliver of actual scroll distance). The delta is
              // 2024 -> 2022 only: it fades back out as the next hop starts,
              // since a change vs. the previous election would mix election
              // types.
              deltaOpacity: clamp01((u0 - 0.85) / 0.15) * (1 - clamp01((pos - 1) / 0.15)),
            }}
            yDomain={yDomain}
            // Off once the chart is scroll-driven: a time tween there fights
            // the scroll instead of following it.
            transitionMs={progress > TWEEN_UNTIL ? 0 : 700}
            tooltipFor={tooltipFor}
            summary={summary}
            summaryTooltip={summaryTooltip}
            // Clock centred on the 1M gridline: low enough to leave the
            // under-35 shortfall and the 60s bulge in view as it passes.
            plotOverlay={({ yPct }) => (
              <RewindOverlay
                u={u}
                label={direction === "back" ? explorerCopy.rewinding : explorerCopy.fastForwarding}
                clockTop={`${yPct(1000)}%`}
              />
            )}
            plotHaze={rewindHaze(u)}
          />
        </StickyViz>
        <div className="voa-scrolly-steps">
          {ageBeatsSteps.map((s, i) => (
            <div className="voa-step" key={i} ref={stepRef(i)}>
              <div className="voa-step-inner">
                {i === MORPH_STEP && (
                  // Beat 2 starts here. Its heading rides up the text column
                  // rather than ruling off the page full-width, because the
                  // chart to its left is the same element and must not unstick.
                  <h2 className="voa-beat-title voa-beat-title--incolumn">{midtermsTitle}</h2>
                )}
                <h3>{typeof s.heading === "function" ? s.heading(copyVals) : s.heading}</h3>
                {s.body(copyVals)}
              </div>
            </div>
          ))}
          <div className="voa-step" ref={stepRef(SUMMARY_STEP)}>
            <div className="voa-step-inner">
              <h2 className="voa-beat-title voa-beat-title--incolumn">{summaryTitle}</h2>
              <h3>{summaryCopy.mergeHeading}</h3>
              {summaryCopy.merge({ year: mergeYear })}
            </div>
          </div>
          <div className="voa-step" ref={stepRef(SUMMARY_STEP + 1)}>
            <div className="voa-step-inner">
              <h3>{summaryCopy.revealHeading}</h3>
              {summaryCopy.reveal()}
            </div>
          </div>
          {midtermDropSteps.map((s, i) => (
            <div className="voa-step" key={`drop-${i}`} ref={stepRef(DROP_STEP + i)}>
              <div className="voa-step-inner">
                <h3>{typeof s.heading === "function" ? s.heading(dropVals) : s.heading}</h3>
                {s.body(dropVals)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
