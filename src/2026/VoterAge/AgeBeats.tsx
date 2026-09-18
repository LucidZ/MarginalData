import { useCallback, useMemo } from "react";
import PopulationBars, { type PopulationBarRow } from "./PopulationBars";
import StickyViz from "./StickyViz";
import { useStepProgress } from "./useStepProgress";
import { fmtM, fmtMSigned, fmtPct } from "./format";
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
 * Steps 0-5 accumulate the 2024 chart layer by layer, off a rounded step
 * index (the layer toggles are genuinely discrete, and each gets d3's
 * 700ms tween). Steps 6-8 morph it to 2022 continuously off the raw scroll
 * fraction, with the tween disabled - see .claude/voter-age-scroll-morph-spec.md
 * and .claude/voter-age-morph-honesty-spec.md.
 */

const STEP_COUNT = 9;
/** Index of beat 2's first step - the morph is measured from here. */
const MORPH_STEP = 6;
/** Past this point the chart is scroll-driven, so d3's time tween is off. */
const TWEEN_UNTIL = 5.4;

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
  //   u  - raw linear fraction, drives the year-stamp cross-fade (wants to
  //        read as a progress indicator: starts moving immediately, settles
  //        exactly when the morph completes).
  //   t  - eased version of u, drives bar/line geometry (steep middle so a
  //        reader crosses quickly and rests at the two real states).
  //   printed numbers - snap off `shown` (t<0.5), never off the lerped rows.
  const u = clamp01((progress - MORPH_STEP - 0.15) / 0.7);
  const t = ease(u);

  // Identity-stable at both ends: through all of beat 1 this returns the
  // very same `rows2024` array, so the d3 effect doesn't re-run (and re-fire
  // a 700ms tween) on every one of the ~200 scroll quanta the progress hook
  // reports across the beat.
  const activeRows = useMemo(() => {
    if (t <= 0) return rows2024;
    if (t >= 1) return rows2022;
    return rows2024.map((r, i) => {
      const b = rows2022[i];
      return {
        ...r,
        cvap: lerp(r.cvap, b.cvap, t),
        votes: lerp(r.votes, b.votes, t),
        expected: lerp(r.expected, b.expected, t),
        missing: lerp(r.missing, b.missing, t),
        turnout: lerp(r.turnout, b.turnout, t),
      };
    });
  }, [rows2024, rows2022, t]);

  // Which real election the LABELS describe. Everything printed reads from
  // this, never from activeRows (which mid-morph describes no election that
  // ever happened). See morph spec S2/S4c.
  const shownYear2022 = t >= 0.5;
  const shownCycle = shownYear2022 ? cycle2022 : cycle2024;
  const shownRows = shownYear2022 ? rows2022 : rows2024;
  const shownRowsByKey = useMemo(() => new Map(shownRows.map((r) => [r.key, r])), [shownRows]);

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
  // Votes short of the 65+ benchmark among ages 80 and up specifically -
  // small in raw votes (that population is small), but the point is the
  // reversal: even the oldest ages eventually fall under the standard their
  // own age group sets.
  const missing80Plus = shortfallOf(cycle2024.rows.filter((r) => r.age >= 80));

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
  const tooltipFor = useCallback(
    (row: PopulationBarRow) => {
      const real = shownRowsByKey.get(row.key) ?? row;
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
    [shownRowsByKey, shownYear2022, shownCycle]
  );

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">1. The shape of the electorate</h2>
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
            expectedLineLabel={`expected at the 65+ rate (${fmtPct(shownYear2022 ? BENCH_2022 : BENCH)})`}
            showGap={step >= 3}
            heroGap={{
              figure: fmtM(shortfallShown),
              label: `votes short of the ${shownYear2022 ? "2022" : "2024"} 65+ standard`,
              delta: fmtMSigned(deltaVs2024),
              // Mounted from first paint (so the space it takes is reserved
              // and its arrival moves nothing), faded in as the reader
              // reaches the step that first adds the gold up.
              opacity: clamp01((progress - 3.55) / 0.35),
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
            plotOverlay={
              <div className="voa-year-stamp" aria-hidden="true">
                <span style={{ opacity: 1 - u }}>2024</span>
                <span style={{ opacity: u }}>2022</span>
              </div>
            }
          />
        </StickyViz>
        <div className="voa-scrolly-steps">
          <div className="voa-step" ref={setStepRef(0)}>
            <div className="voa-step-inner">
              <h3>Every bar is one year of age</h3>
              <p>
                The light bar is how many citizens of that age were eligible to vote in 2024. There are more
                25-year-olds ({fmtM(age25.cvap)} eligible) than 75-year-olds ({fmtM(age75.cvap)}) — the population
                just gets thinner with age, the way it does in most rich countries.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(1)}>
            <div className="voa-step-inner">
              <h3>Now add who actually voted</h3>
              <p>
                The solid bar is votes cast. It's shorter than the light bar everywhere — turnout is never 100% — but
                not by the same amount at every age. Watch how much of the light bar the solid one covers as you move
                left to right.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(2)}>
            <div className="voa-step-inner">
              <h3>The dotted line is what 65-and-over does</h3>
              <p>
                It traces what each age's vote bar would reach if every age turned out the way people 65 and older
                actually do: {fmtPct(BENCH)}. That's the most reliable bloc in the electorate — the one group whose
                turnout barely moves from one election to the next — so it's a steadier yardstick than a national
                average that blends every age together.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(3)}>
            <div className="voa-step-inner">
              <h3>Fill in what's missing</h3>
              <p>
                Gold is the distance from a bar up to that line: votes an age would have cast at the 65+ rate, and
                didn't. The gold runs out around age {cycle2024.crossoverAge} — not a hard cutoff, a few ages just
                below it already clear the line before it holds for good, but that's roughly where turnout catches up
                to the 65+ standard.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(4)}>
            <div className="voa-step-inner">
              <h3>In votes, not percentages</h3>
              <p>
                Add the gold up and it comes to <strong>{fmtM(shortfall2024)} votes</strong> — ballots that would
                exist if every age turned out the way 65-and-overs do. Most of it is concentrated young: under-35s
                account for <strong>{fmtM(under35Missing)}</strong> of the total on their own.
              </p>
              <div className="voa-callout">
                {fmtM(shortfall2024)} missing votes, {fmtPct((shortfall2024 / cycle2024.totalVotes) * 100)} of every
                ballot cast in 2024 — and <strong>{fmtM(under35Missing)}</strong> of it is under 35.
              </div>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(5)}>
            <div className="voa-step-inner">
              <h3>Even 65+'s own standard doesn't hold forever</h3>
              <p>
                Watch the far right edge: by around age {cycle2024.declineAge}, the gold comes back. Turnout keeps
                declining into the 80s and 90s — even the age group that sets this bar eventually falls short of it.
                The 65+ line isn't a ceiling everyone past 65 clears; it's a bloc average with its own decline built
                in at the far end.
              </p>
              <div className="voa-callout">
                <strong>{fmtM(missing80Plus)}</strong> of the shortfall is ages 80 and up — a small slice of a small
                population, but a real reversal of the pattern the rest of the chart shows.
              </div>
            </div>
          </div>

          <div className="voa-step" ref={setStepRef(6)}>
            <div className="voa-step-inner">
              {/* Beat 2 starts here. Its heading rides up the text column
                  rather than ruling off the page full-width, because the
                  chart to its left is the same element and must not unstick. */}
              <h2 className="voa-beat-title voa-beat-title--incolumn">2. Midterms make it worse</h2>
              <h3>No president on the ballot</h3>
              <p>
                Nothing has moved: same bars, same 2024 election, same line. Now change exactly one thing about it —
                take the president off the ballot. In a midterm, turnout drops for everyone. The question is whether
                it drops evenly.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(7)}>
            <div className="voa-step-inner">
              <h3>2022: even the standard slips</h3>
              <p>
                Watch the dotted line, not just the bars — it isn't fixed. It traces what 65-and-overs manage in each
                election on its own terms, the same way it did a moment ago: {fmtPct(BENCH)} in 2024, down to{" "}
                {fmtPct(BENCH_2022)} in a midterm. Even the most reliable voters in the country turn out less without
                a president on the ballot — but only by eight points.
              </p>
              <p>
                What doesn't slip by eight points is everyone else. Watch how much further the bars themselves fall
                against that lower line.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(8)}>
            <div className="voa-step-inner">
              <h3>The young nearly stop showing up; the old barely notice</h3>
              <p>Turnout by single year of age, presidential vs. midterm:</p>
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
                      <td className={r.t2022 - r.t2024 < -10 ? "voa-compare-big-drop" : ""}>
                        {(r.t2022 - r.t2024).toFixed(1)}pp
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                An 18-year-old's turnout is nearly cut in half. A 79-year-old's barely moves. Older voters show up
                regardless of what's on the ballot; younger voters mostly show up for president.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
