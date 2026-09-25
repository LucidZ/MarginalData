import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PopulationBars, { type PopulationBarRow } from "./PopulationBars";
import StickyViz from "./StickyViz";
import RewindOverlay, { rewindHaze } from "./RewindOverlay";
import { readingLine, useStepProgress } from "./useStepProgress";
import YearControl, { type YearOption } from "./YearControl";
import { cohortRows, hopRows } from "./ageRows";
import { fmtM, fmtMSigned, fmtPct } from "./format";
import { ageBeatsSteps, ageBeatsTitle, explorerCopy, midtermsTitle, type AgeBeatsVals } from "./copy";
import type { VoterAgeData, AgeRow } from "./types";

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
 * Steps 0-4 accumulate the 2024 chart layer by layer, off a rounded step
 * index (the layer toggles are genuinely discrete, and each gets d3's
 * 700ms tween): eligible, votes, the 65+ turnout standard and its total
 * shortfall, then the "why" - the registered bar, and the 65+
 * registration standard with its gap. That last view is what the morph
 * carries: gold (not registered) and the registered bar showing above
 * the votes bar (registered, didn't vote) are the two hurdles, and beat 2
 * is watching both change. Steps 5-7 morph it to 2022 continuously off the raw scroll
 * fraction, with the tween disabled - see .claude/voter-age-scroll-morph-spec.md
 * and .claude/voter-age-morph-honesty-spec.md.
 *
 * Section 3 keeps the same pinned chart and keeps going back: one step per
 * election, 2022 -> 2020 -> ... -> 2012, each hop the same morph as beat 2
 * (cohorts slide two years, values lerp, printed numbers snap). Scrolling up
 * plays it forward. Bars are keyed by birth cohort (ageRows.ts), so the same
 * people keep the same element across all six hops.
 */

/** Index of beat 2's first step - the first hop (2024 -> 2022) is measured from here. */
const MORPH_STEP = 5;
/** Section 3's first step: heading and intro, the chart still resting on
 * 2022. Then one step per year from 2022 back, each holding just that
 * year's card - kept apart from the intro so no card sits at the bottom of
 * a step too tall for a phone's reading band. Every later hop runs from one
 * year's step to the next. */
const EXPLORER_STEP = 8;
/** The single 65+ turnout standard and its total shortfall. */
const TOTAL_STEP = 2;
/** The registered bar arrives; the turnout standard goes. */
const REG_STEP = 3;
/** The 65+ registration standard and its gap - held through the morph. */
const REG_GAP_STEP = 4;
/** Past this point the chart is scroll-driven, so d3's time tween is off. */
const TWEEN_UNTIL = MORPH_STEP - 0.6;

const COMPARE_AGES = [18, 22, 65, 79];

/** Matches App.css's phone breakpoint, where the chart pins above the text. */
const PHONE_QUERY = "(max-width: 720px)";

/** Step whose centre each hop starts from: hop 0 (2024 -> 2022) is beat 2's;
 * hop h >= 1 runs from year h's card step to year h+1's. */
const hopStart = (h: number) => (h === 0 ? MORPH_STEP : EXPLORER_STEP + h);
/** The step resting on year index k (0 = 2024): beat 2's first step for
 * 2024 (the full registration view, just before the first hop), else that
 * year's card step. */
const restStep = (k: number) => (k === 0 ? MORPH_STEP : EXPLORER_STEP + k);
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

/** Pooled rates over an age range: registered/eligible, and votes/registered
 * (how reliably the registered actually vote). */
function bracketRates(rows: AgeRow[], lo: number, hi: number) {
  const inRange = rows.filter((r) => r.age >= lo && r.age <= hi);
  const sum = (k: "cvap" | "votes" | "registered") => inRange.reduce((s, r) => s + r[k], 0);
  return { registered: (100 * sum("registered")) / sum("cvap"), showUp: (100 * sum("votes")) / sum("registered") };
}

/** Every age that fell short of its cycle's 65+ standard, summed - the same
 * quantity the chart shades gold. */
const shortfallOf = (rows: { missing: number }[]) =>
  Math.abs(rows.reduce((s, r) => s + Math.min(0, r.missing), 0));

export default function AgeBeats({ data }: { data: VoterAgeData }) {
  // Newest first: index 0 is 2024, the chart beat 1 builds; each scroll hop
  // goes one index further back.
  const years = useMemo(() => Object.keys(data.byAge).sort().reverse(), [data]);
  const hopCount = years.length - 1;
  const stepCount = EXPLORER_STEP + 1 + hopCount;

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
  const stepEls = useRef<(HTMLElement | null)[]>([]);
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

  const yearOptions: YearOption[] = useMemo(
    () => [...years].reverse().map((year) => ({ year, kind: data.byAge[year].kind })),
    [years, data]
  );
  const pickYear = useCallback(
    (year: string) => {
      const el = stepEls.current[restStep(years.indexOf(year))];
      if (!el) return;
      const r = el.getBoundingClientRect();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Where the step will be read once there: on phones, below the pinned
      // pane (stuck by then, so its full height), else mid-viewport.
      const pane = pinnedPane();
      const covered = window.matchMedia(PHONE_QUERY).matches && pane ? pane.getBoundingClientRect().height : 0;
      window.scrollTo({
        top: window.scrollY + r.top + r.height / 2 - readingLine(covered),
        behavior: reduce ? "auto" : "smooth",
      });
    },
    [years]
  );

  // Pinned across every cycle from first paint, so the axis never rescales -
  // not at a beat-1 layer reveal, and not under any hop.
  const yDomain = useMemo((): [number, number] => {
    const maxCvap = Math.max(...Object.values(data.byAge).flatMap((c) => c.rows.map((r) => r.cvap)));
    return [0, maxCvap * 1.08];
  }, [data]);

  const shortfall2024 = shortfallOf(cycle2024.rows);

  const under35Missing = shortfallOf(cycle2024.rows.filter((r) => r.age < 35));

  const age25 = cycle2024.rows.find((r) => r.age === 25)!;
  const age75 = cycle2024.rows.find((r) => r.age === 75)!;

  const compareRows = COMPARE_AGES.map((age) => ({
    age,
    t2024: cycle2024.rows.find((r) => r.age === age)!.turnout,
    t2022: cycle2022.rows.find((r) => r.age === age)!.turnout,
  }));

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
      const didntVote = real.registered! - real.votes;
      return (
        <>
          <div className="voa-tooltip__head">
            Age {real.label} · {year}
            {real.ratesPooled ? " (rate shared across 80-84/85+)" : ""}
          </div>
          {fmtM(real.cvap)} eligible
          {step >= REG_STEP ? ` · ${fmtM(real.registered!)} registered` : ""}
          {` · ${fmtM(real.votes)} voted (${fmtPct(real.turnout)})`}
          <br />
          {step < REG_STEP ? (
            <>
              Expected at {fmtPct(shownCycle.over65Turnout)} (the {year} 65+ rate): {fmtM(real.expected)}
              <div className="voa-tooltip__note">{fmtMSigned(real.missing)} vs. that benchmark</div>
            </>
          ) : (
            <>
              {step >= REG_GAP_STEP && (
                <>
                  At the {year} 65+ registration rate ({fmtPct(shownCycle.over65Registration)}):{" "}
                  {fmtM(real.expectedRegistered!)} registered
                  <br />
                </>
              )}
              <div className="voa-tooltip__note">
                {step >= REG_GAP_STEP
                  ? `${fmtMSigned(real.registered! - real.expectedRegistered!)} registered vs. that standard · `
                  : ""}
                {fmtM(didntVote)} registered but didn't vote
              </div>
            </>
          )}
        </>
      );
    },
    [morphing, shownRowsByKey, shownYear, shownCycle, step]
  );

  const youth2024 = bracketRates(cycle2024.rows, 18, 24);
  const youth2022 = bracketRates(cycle2022.rows, 18, 24);

  const compareTable = (
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
            <td className={r.t2022 - r.t2024 < -10 ? "voa-compare-big-drop" : ""}>{(r.t2022 - r.t2024).toFixed(1)}pp</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Fades in as beat 2's heading comes up, fully there (resting on 2024)
  // before the first hop starts - through beat 1 there is only one year, so
  // a timeline is noise.
  const timelineOpacity = clamp01((progress - (MORPH_STEP - 0.45)) / 0.35);
  const explorerVals = { firstYear: years[years.length - 1] };
  const stepRef = (i: number) => (el: HTMLElement | null) => {
    setStepRef(i)(el);
    stepEls.current[i] = el;
  };

  const copyVals: AgeBeatsVals = {
    age25cvap: fmtM(age25.cvap),
    age75cvap: fmtM(age75.cvap),
    bench: fmtPct(BENCH),
    bench2022: fmtPct(BENCH_2022),
    crossoverAge: cycle2024.crossoverAge,
    shortfall2024: fmtM(shortfall2024),
    under35Missing: fmtM(under35Missing),
    shortfall2024Pct: fmtPct((shortfall2024 / cycle2024.totalVotes) * 100),
    reg65: fmtPct(cycle2024.over65Registration),
    reg65_2022: fmtPct(cycle2022.over65Registration),
    youthReg: fmtPct(youth2024.registered),
    youthShowUp: fmtPct(youth2024.showUp),
    youthShowUp2022: fmtPct(youth2022.showUp),
    regGap2024: fmtM(cycle2024.registrationGap),
    notVoted2024: fmtM(cycle2024.registeredNotVoted),
    regGap2022: fmtM(cycle2022.registrationGap),
    notVoted2022: fmtM(cycle2022.registeredNotVoted),
    compareTable,
  };

  return (
    <section className="voa-beat" ref={sectionRef}>
      <h2 className="voa-beat-title">{ageBeatsTitle}</h2>
      <div className="voa-scrolly">
        <StickyViz>
          {/* Mounted from first paint and only faded, like every other
              arriving layer, so its arrival can't move the chart. */}
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
          <YearControl
            options={yearOptions}
            shown={shownYear}
            resting={restingYear}
            dotPos={hopCount - pos}
            dotOpacity={rewindHaze(u)}
            opacity={timelineOpacity}
            onPick={pickYear}
          />
          <PopulationBars
            rows={activeRows}
            xKind="age"
            xLabel="Age"
            yLabel="People (millions)"
            showTrack
            showVotes={step >= 1}
            registeredOpacity={step >= REG_STEP ? 1 : 0}
            registrationStandard={step >= REG_GAP_STEP ? { line: 1, gap: 1 } : { line: 0, gap: 0 }}
            showExpected={step === TOTAL_STEP}
            showGap={step === TOTAL_STEP}
            expectedLineLabel={
              step >= REG_GAP_STEP
                ? `at 65+ registration (${fmtPct(shownCycle.over65Registration)})`
                : `at 65+ turnout (${fmtPct(BENCH)})`
            }
            gapLegendLabel={step >= REG_GAP_STEP ? "Not registered" : "Votes short"}
            heroGap={
              step < REG_STEP
                ? {
                    items: [
                      { figure: fmtM(shortfall2024), label: "votes short of the 65+ standard", delta: "", swatch: "gap" },
                    ],
                    // Mounted from first paint (so the space it takes is
                    // reserved and its arrival moves nothing), faded in as
                    // the reader reaches the step that adds the gold up.
                    opacity: clamp01((progress - (TOTAL_STEP - 0.45)) / 0.35),
                    deltaOpacity: 0,
                  }
                : {
                    // The two hurdles, carried through every hop. Each
                    // prints only a real election's figure (`shownCycle`,
                    // snapped at t=0.5), never one read off lerped rows.
                    items: [
                      {
                        figure: fmtM(shownCycle.registrationGap),
                        label: "not registered",
                        delta: fmtMSigned(cycle2022.registrationGap - cycle2024.registrationGap),
                        swatch: "gap",
                      },
                      {
                        figure: fmtM(shownCycle.registeredNotVoted),
                        label: "registered, didn't vote",
                        delta: fmtMSigned(cycle2022.registeredNotVoted - cycle2024.registeredNotVoted),
                        swatch: "registered",
                      },
                    ],
                    // Hidden while only the registered bar is up (nothing
                    // gold to total yet). Dimmed with the plot mid-morph: a
                    // crisp number under a rewinding chart still invites
                    // reading it as the chart's.
                    opacity:
                      clamp01((progress - (REG_GAP_STEP - 0.45)) / 0.35) * (1 - 0.65 * rewindHaze(u)),
                    // Fades in over beat 2's hop's last ~15%. Keyed to raw
                    // `u`, the linear scroll signal, not the eased `t` (whose
                    // last 15% is a much narrower sliver of actual scroll
                    // distance). These deltas are 2024 -> 2022 only: it fades
                    // back out as the next hop starts, since a change vs. the
                    // previous election would mix election types.
                    deltaOpacity: clamp01((u0 - 0.85) / 0.15) * (1 - clamp01((pos - 1) / 0.15)),
                  }
            }
            yDomain={yDomain}
            // Off once the chart is scroll-driven: a time tween there fights
            // the scroll instead of following it.
            transitionMs={progress > TWEEN_UNTIL ? 0 : 700}
            tooltipFor={tooltipFor}
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
                <h3>{s.heading}</h3>
                {s.body(copyVals)}
              </div>
            </div>
          ))}
          <div className="voa-step" ref={stepRef(EXPLORER_STEP)}>
            <div className="voa-step-inner">
              <h2 className="voa-beat-title voa-beat-title--incolumn">{explorerCopy.title(explorerVals)}</h2>
              {explorerCopy.intro(explorerVals)}
            </div>
          </div>
          {years.slice(1).map((year, k) => {
            const c = data.byAge[year];
            return (
              <div className="voa-step" key={year} ref={stepRef(restStep(k + 1))}>
                <div className="voa-step-inner">
                  <div
                    className={`voa-year-card voa-year-card--${c.kind}${year === restingYear ? " is-on" : ""}`}
                    data-year={year}
                  >
                    <div className="voa-year-card__head">
                      <span className="voa-year-card__year">{year}</span>
                      <span className="voa-year-card__kind">
                        {c.kind === "midterm" ? explorerCopy.midterm : explorerCopy.presidential}
                      </span>
                    </div>
                    <p>{explorerCopy.yearCard({ year, kind: c.kind, turnout: fmtPct(c.avgTurnout) })}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
