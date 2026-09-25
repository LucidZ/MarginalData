import { useCallback, useMemo } from "react";
import PopulationBars, { type PopulationBarRow } from "./PopulationBars";
import StickyViz from "./StickyViz";
import RewindOverlay, { rewindHaze } from "./RewindOverlay";
import { useStepProgress } from "./useStepProgress";
import { fmtM, fmtMSigned, fmtPct } from "./format";
import { ageBeatsSteps, ageBeatsTitle, midtermsTitle, type AgeBeatsVals } from "./copy";
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
 * physical element: one sticky pane spanning nine steps, with beat 2's
 * heading riding up the text column while the chart stays put.
 *
 * Steps 0-4 accumulate the 2024 chart layer by layer, off a rounded step
 * index (the layer toggles are genuinely discrete, and each gets d3's
 * 700ms tween). Steps 5-7 morph it to 2022 continuously off the raw scroll
 * fraction, with the tween disabled - see .claude/voter-age-scroll-morph-spec.md
 * and .claude/voter-age-morph-honesty-spec.md.
 */

const STEP_COUNT = 8;
/** Index of beat 2's first step - the morph is measured from here. */
const MORPH_STEP = 5;
/** Past this point the chart is scroll-driven, so d3's time tween is off. */
const TWEEN_UNTIL = 4.4;

const COMPARE_AGES = [18, 22, 65, 79];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// Steepened ease-in-out: flat shoulders, fast middle, so the chart rests at
// the two real states and crosses between them quickly - a reader can still
// stop and reverse anywhere, it just takes intent. gamma=3 puts most of the
// change in the middle third. See .claude/voter-age-morph-honesty-spec.md S4a.
function ease(x: number, gamma = 3) {
  return x < 0.5 ? Math.pow(2 * x, gamma) / 2 : 1 - Math.pow(2 * (1 - x), gamma) / 2;
}

function toBarRow(row: AgeRow): PopulationBarRow {
  return {
    key: `age-${row.age}`,
    x: row.age,
    label: row.age === 100 ? "100+" : String(row.age),
    cvap: row.cvap,
    votes: row.votes,
    expected: row.expected, // this cycle's own 65+ rate x cvap
    missing: row.missing,
    turnout: row.turnout,
    ratesPooled: row.ratesPooled,
  };
}

/** Every age that fell short of its cycle's 65+ standard, summed - the same
 * quantity the chart shades gold. */
const shortfallOf = (rows: { missing: number }[]) =>
  Math.abs(rows.reduce((s, r) => s + Math.min(0, r.missing), 0));

export default function AgeBeats({ data }: { data: VoterAgeData }) {
  const { progress, activeStep: step, setStepRef } = useStepProgress(STEP_COUNT);
  const cycle2024 = data.byAge["2024"];
  const cycle2022 = data.byAge["2022"];

  // Each cycle's own 65+ rate - never hand-typed, straight from the data.
  // The dotted line is NOT pinned to 2024: it traces whichever cycle is
  // showing.
  const BENCH = cycle2024.over65Turnout; // 74.62
  const BENCH_2022 = cycle2022.over65Turnout; // 66.79

  const rows2024 = useMemo(() => cycle2024.rows.map(toBarRow), [cycle2024]);
  const rows2022 = useMemo(() => cycle2022.rows.map(toBarRow), [cycle2022]);

  // Three independent channels driven off the same scroll span - do not
  // unify them (morph spec S2):
  //   u  - raw linear fraction, drives the RewindOverlay scrubber/clock and
  //        the chart haze (wants to read as a progress indicator: starts
  //        moving immediately, settles exactly when the morph completes).
  //   t  - eased version of u, drives bar/line geometry (steep middle so a
  //        reader crosses quickly and rests at the two real states).
  //   printed numbers - snap off `shown` (t<0.5), never off the lerped rows.
  const u = clamp01((progress - MORPH_STEP - 0.15) / 0.7);
  const t = ease(u);

  /** 2024 -> 2022: the same cohort is two years younger. */
  const SHIFT_YEARS = 2;

  const rows2022ByAge = useMemo(() => new Map(rows2022.map((r) => [Number(r.x), r])), [rows2022]);

  // The t=1 resting state, memoized so the d3 effect doesn't re-run on every
  // scroll quantum once the morph has settled - same reason `rows2024` is
  // returned by identity at t=0.
  const rowsSettled2022 = useMemo(
    () =>
      rows2024.map((r) => {
        const age = Number(r.x);
        const target = rows2022ByAge.get(age - SHIFT_YEARS);
        const xPos = age - SHIFT_YEARS;
        // Cohorts 18 and 19 were 16 and 17 in 2022 - below voting age, so
        // Census has no row for them. They slide off the left edge holding
        // their real 2024 heights rather than lerping toward a number that
        // doesn't exist. (The mirror of this: slots 99 and 100 end up empty,
        // because filling them would need 2024 ages 101-102. Those bars are
        // ~1px tall and worth 0.013M of the 36.1M gold total - the printed
        // figure is still the full-year one.)
        if (!target) return { ...r, xPos, opacity: 0 };
        // Keep the slot's own x/label: the axis ticks are placed by key and
        // labelled by x, so taking target's (2-years-younger) x here would
        // print "20" under the 2024 age-22 slot - every tick shifted right by
        // the cohort slide the bars just made. Only the data fields move.
        return { ...target, key: r.key, x: r.x, label: r.label, xPos };
      }),
    [rows2024, rows2022ByAge]
  );

  // Identity-stable at both ends: through all of beat 1 this returns the
  // very same `rows2024` array, so the d3 effect doesn't re-run (and re-fire
  // a 700ms tween) on every one of the ~200 scroll quanta the progress hook
  // reports across the beat.
  const activeRows = useMemo(() => {
    if (t <= 0) return rows2024;
    if (t >= 1) return rowsSettled2022;
    return rows2024.map((r) => {
      const age = Number(r.x);
      const target = rows2022ByAge.get(age - SHIFT_YEARS);
      const xPos = age - SHIFT_YEARS * t;
      if (!target) return { ...r, xPos, opacity: clamp01(1 - t / 0.4) };
      return {
        ...r,
        xPos,
        cvap: lerp(r.cvap, target.cvap, t),
        votes: lerp(r.votes, target.votes, t),
        expected: lerp(r.expected, target.expected, t),
        missing: lerp(r.missing, target.missing, t),
        turnout: lerp(r.turnout, target.turnout, t),
      };
    });
  }, [rows2024, rows2022ByAge, rowsSettled2022, t]);

  // Which real election the LABELS describe. Everything printed reads from
  // this, never from activeRows (which mid-morph describes no election that
  // ever happened). See morph spec S2/S4c.
  const shownYear2022 = t >= 0.5;
  const shownCycle = shownYear2022 ? cycle2022 : cycle2024;
  // Cohort-aware: once 2022 is showing, bar `age-a` displays 2022's age
  // a-2 (the cohort slide), not 2022's own age a.
  const shownRowsByKey = useMemo(() => {
    if (!shownYear2022) return new Map(rows2024.map((r) => [r.key, r]));
    const m = new Map<string, PopulationBarRow>();
    for (const r of rows2024) {
      const target = rows2022ByAge.get(Number(r.x) - SHIFT_YEARS);
      if (target) m.set(r.key, target);
    }
    return m;
  }, [shownYear2022, rows2024, rows2022ByAge]);

  // Pinned across both cycles from first paint, so the axis never rescales -
  // not at a beat-1 layer reveal, and not under the morph.
  const yDomain = useMemo((): [number, number] => {
    const maxCvap = Math.max(...cycle2024.rows.map((r) => r.cvap), ...cycle2022.rows.map((r) => r.cvap));
    return [0, maxCvap * 1.08];
  }, [cycle2024, cycle2022]);

  const shortfall2024 = shortfallOf(rows2024);
  const shortfall2022 = shortfallOf(rows2022);
  const shortfallShown = shownYear2022 ? shortfall2022 : shortfall2024;
  const deltaVs2024 = shortfall2022 - shortfall2024;

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
      const year = shownYear2022 ? "2022" : "2024";
      return (
        <>
          <div className="voa-tooltip__head">
            Age {real.label} · {year}
            {real.ratesPooled ? " (rate shared across 80-84/85+)" : ""}
          </div>
          {fmtM(real.cvap)} eligible · {fmtM(real.votes)} voted ({fmtPct(real.turnout)})
          <br />
          Expected at {fmtPct(shownCycle.over65Turnout)} (the {year} 65+ rate): {fmtM(real.expected)}
          <div className="voa-tooltip__note">{fmtMSigned(real.missing)} vs. that benchmark</div>
        </>
      );
    },
    [morphing, shownRowsByKey, shownYear2022, shownCycle]
  );

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

  const copyVals: AgeBeatsVals = {
    age25cvap: fmtM(age25.cvap),
    age75cvap: fmtM(age75.cvap),
    bench: fmtPct(BENCH),
    bench2022: fmtPct(BENCH_2022),
    crossoverAge: cycle2024.crossoverAge,
    shortfall2024: fmtM(shortfall2024),
    under35Missing: fmtM(under35Missing),
    shortfall2024Pct: fmtPct((shortfall2024 / cycle2024.totalVotes) * 100),
    compareTable,
  };

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">{ageBeatsTitle}</h2>
      <div className="voa-scrolly">
        <StickyViz>
          <PopulationBars
            rows={activeRows}
            xKind="age"
            xLabel="Age"
            yLabel="People (millions)"
            showTrack
            showVotes={step >= 1}
            showExpected={step >= 2}
            expectedLineLabel={`at 65+ turnout (${fmtPct(shownYear2022 ? BENCH_2022 : BENCH)})`}
            showGap={step >= 3}
            heroGap={{
              figure: fmtM(shortfallShown),
              label: `votes short of the ${shownYear2022 ? "2022" : "2024"} 65+ standard`,
              delta: fmtMSigned(deltaVs2024),
              // Mounted from first paint (so the space it takes is reserved
              // and its arrival moves nothing), faded in as the reader
              // reaches the step that first adds the gold up.
              // Dimmed with the plot mid-morph: it only ever prints a real
              // year's figure, but a crisp number under a rewinding chart
              // still invites reading it as the chart's.
              opacity: clamp01((progress - 3.55) / 0.35) * (1 - 0.65 * rewindHaze(u)),
              // Fades in over the morph's last ~15%. Keyed to raw `u`, the
              // linear scroll signal, not the eased `t` (whose last 15% is a
              // much narrower sliver of actual scroll distance).
              deltaOpacity: clamp01((u - 0.85) / 0.15),
            }}
            yDomain={yDomain}
            // Off once the chart is scroll-driven: a time tween there fights
            // the scroll instead of following it.
            transitionMs={progress > TWEEN_UNTIL ? 0 : 700}
            tooltipFor={tooltipFor}
            // Clock centred on the 1M gridline: low enough to leave the
            // under-35 shortfall and the 60s bulge in view as it passes.
            // Scrubber fades in as beat 2's heading comes up, fully there
            // (resting on 2024) before the dot starts moving at u=0.
            plotOverlay={({ yPct }) => (
              <RewindOverlay
                u={u}
                clockTop={`${yPct(1000)}%`}
                scrubberOpacity={clamp01((progress - (MORPH_STEP - 0.45)) / 0.35)}
              />
            )}
            plotHaze={rewindHaze(u)}
          />
        </StickyViz>
        <div className="voa-scrolly-steps">
          {ageBeatsSteps.map((s, i) => (
            <div className="voa-step" key={i} ref={setStepRef(i)}>
              <div className="voa-step-inner">
                {i === 5 && (
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
        </div>
      </div>
    </section>
  );
}
