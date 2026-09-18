import { useMemo } from "react";
import PopulationBars, { type PopulationBarRow } from "./PopulationBars";
import StickyViz from "./StickyViz";
import { useStepProgress } from "./useStepProgress";
import { fmtM, fmtMSigned, fmtPct } from "./format";
import type { VoterAgeData, AgeRow } from "./types";

const STEP_COUNT = 3;
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
    expected: row.expected, // this cycle's own 65+ rate x cvap - same field Beat1 uses
    missing: row.missing,
    turnout: row.turnout,
    ratesPooled: row.ratesPooled,
  };
}

const shortfallOf = (rows: PopulationBarRow[]) =>
  Math.abs(rows.filter((r) => r.missing < 0).reduce((s, r) => s + r.missing, 0));

export default function Beat2({ data }: { data: VoterAgeData }) {
  const { progress, setStepRef } = useStepProgress(STEP_COUNT);
  const cycle2024 = data.byAge["2024"];
  const cycle2022 = data.byAge["2022"];

  // Each cycle's own 65+ rate - never hand-typed, comes straight from the
  // data, same as Beat1. Unlike the earlier version of this beat, the
  // dotted line is NOT pinned to 2024: it traces whichever cycle is
  // showing, exactly like beat one's single benchmark line.
  const BENCH = cycle2024.over65Turnout; // 74.62
  const BENCH_2022 = cycle2022.over65Turnout; // 66.79

  const rows2024 = useMemo(() => cycle2024.rows.map(toBarRow), [cycle2024]);
  const rows2022 = useMemo(() => cycle2022.rows.map(toBarRow), [cycle2022]);

  // Three independent channels driven off the same scroll span - do not
  // unify them (spec S2):
  //   u  - raw linear fraction, drives the year-stamp cross-fade (wants to
  //        read as a progress indicator: starts moving immediately, settles
  //        exactly when the morph completes).
  //   t  - eased version of u, drives bar/line geometry (steep middle so a
  //        reader crosses quickly and rests at the two real states).
  //   printed numbers - snap off `shown` (t<0.5), never off the lerped rows.
  const u = clamp01((progress - 0.15) / 0.7);
  const t = ease(u);

  const activeRows = useMemo(
    () =>
      rows2024.map((r, i) => {
        const b = rows2022[i];
        return {
          ...r,
          cvap: lerp(r.cvap, b.cvap, t),
          votes: lerp(r.votes, b.votes, t),
          expected: lerp(r.expected, b.expected, t),
          missing: lerp(r.missing, b.missing, t),
          turnout: lerp(r.turnout, b.turnout, t),
        };
      }),
    [rows2024, rows2022, t]
  );

  // Which real election the LABELS describe. Everything printed reads from
  // this, never from activeRows (which mid-morph describes no election
  // that ever happened). See spec S2/S4c.
  const shownYear2022 = t >= 0.5;
  const shownCycle = shownYear2022 ? cycle2022 : cycle2024;
  const shownRows = shownYear2022 ? rows2022 : rows2024;
  const shownRowsByKey = useMemo(() => new Map(shownRows.map((r) => [r.key, r])), [shownRows]);

  const yDomain = useMemo((): [number, number] => {
    const maxCvap = Math.max(...cycle2024.rows.map((r) => r.cvap), ...cycle2022.rows.map((r) => r.cvap));
    return [0, maxCvap * 1.08];
  }, [cycle2024, cycle2022]);

  const shortfall2024 = shortfallOf(rows2024);
  const shortfall2022 = shortfallOf(rows2022);
  const shortfallShown = shownYear2022 ? shortfall2022 : shortfall2024;
  const deltaVs2024 = shortfall2022 - shortfall2024;

  const compareRows = COMPARE_AGES.map((age) => ({
    age,
    t2024: cycle2024.rows.find((r) => r.age === age)!.turnout,
    t2022: cycle2022.rows.find((r) => r.age === age)!.turnout,
  }));

  // Tooltip content snaps too, the same as every other printed number - a
  // hovered bar mid-morph describes `shown`, not the lerped geometry it
  // happens to be sitting on.
  const tooltipFor = (row: PopulationBarRow) => {
    const real = shownRowsByKey.get(row.key) ?? row;
    return (
      <>
        <div className="voa-tooltip__head">
          Age {real.label} · {shownCycle === cycle2022 ? "2022" : "2024"}
        </div>
        {fmtM(real.cvap)} eligible · {fmtM(real.votes)} voted ({fmtPct(real.turnout)})
        <div className="voa-tooltip__note">
          {fmtMSigned(real.missing)} vs. the {shownYear2022 ? "2022" : "2024"} 65+ standard
        </div>
      </>
    );
  };

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">2. Midterms make it worse</h2>
      <div className="voa-scrolly">
        <StickyViz>
          <PopulationBars
            rows={activeRows}
            xKind="age"
            xLabel="Age"
            yLabel="People (millions)"
            showTrack
            showVotes
            showExpected
            expectedLineLabel={`expected at the 65+ rate (${fmtPct(shownYear2022 ? BENCH_2022 : BENCH)})`}
            showGap
            gapSummaryVariant="hero"
            heroGap={{
              figure: fmtM(shortfallShown),
              label: `votes short of the ${shownYear2022 ? "2022" : "2024"} 65+ standard`,
              delta: fmtMSigned(deltaVs2024),
              // Fades in over the scroll's last ~15% - reserved from first
              // paint (PopulationBars always mounts it), so its arrival
              // moves nothing else. Keyed to raw `u`, the linear scroll
              // signal, not the eased `t` (whose last 15% is a much
              // narrower sliver of actual scroll distance).
              deltaOpacity: clamp01((u - 0.85) / 0.15),
            }}
            yDomain={yDomain}
            tooltipFor={tooltipFor}
            transitionMs={0}
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
              <h3>No president on the ballot</h3>
              <p>
                This is the same 2024 chart from beat one. In a midterm election — no presidential race — turnout
                drops for everyone. The question is whether it drops evenly.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(1)}>
            <div className="voa-step-inner">
              <h3>2022: even the standard slips</h3>
              <p>
                Watch the dotted line, not just the bars — it isn't fixed. It traces what 65-and-overs manage in
                each election on its own terms, same as beat one: {fmtPct(BENCH)} in 2024, down to{" "}
                {fmtPct(BENCH_2022)} in a midterm. Even the most reliable voters in the country turn out less
                without a president on the ballot — but only by eight points.
              </p>
              <p>
                What doesn't slip by eight points is everyone else. Watch how much further the bars themselves
                fall against that lower line.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(2)}>
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
