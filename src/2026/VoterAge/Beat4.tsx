import ColoradoDots from "./ColoradoDots";
import { useActiveStep } from "./useActiveStep";
import type { VoterAgeData } from "./types";

const STEP_COUNT = 5;

export default function Beat4({ data }: { data: VoterAgeData }) {
  const { activeStep: step, setStepRef } = useActiveStep(STEP_COUNT);
  const co = data.colorado;

  const panels = [
    { key: "education", title: "By educational attainment", rows: co.byDimension.education, emphasize: "Less than HS diploma" },
    { key: "race", title: "By race / ethnicity", rows: co.byDimension.race, emphasize: "Asian" },
    { key: "income", title: "By income", rows: co.byDimension.income, emphasize: "$0–30K" },
  ] as const;

  const activePanel = step === 0 ? panels[0] : step === 1 ? panels[1] : panels[2];

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">4. Does anything change this?</h2>
      <div className="voa-scrolly">
        <div className="voa-scrolly-viz">
          {step <= 2 ? (
            <>
              <div className="voa-dim-caption">{activePanel.title}</div>
              <ColoradoDots rows={activePanel.rows} overallEffectPp={co.overall.effectPp} emphasizeGroup={activePanel.emphasize} />
              <p className="voa-dim-note">
                Dashed line: overall effect (+{co.overall.effectPp.toFixed(1)}pp). Each dot is that group's own effect
                ± 1 standard error.
              </p>
            </>
          ) : step === 3 ? (
            <div className="voa-callout voa-co-age-card">
              <div className="voa-co-age-figure">+{co.age.youngestCohortEffectPp}pp</div>
              <div>
                for the youngest cohorts ({co.age.youngestCohortLabel}) — a {co.age.relativeIncreasePct}% relative
                increase over their 2010 turnout. The largest effect of any group in the study.
              </div>
              <p className="voa-dim-note">{co.age.shapeNote}</p>
            </div>
          ) : (
            <div className="voa-callout">
              <strong>Three caveats:</strong>
              <ul className="voa-confound-list">
                {co.confounds.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="voa-scrolly-steps">
          <div className="voa-step" ref={setStepRef(0)}>
            <div className="voa-step-inner">
              <h3>Colorado moved to all-mail voting in 2014</h3>
              <p>
                Every registered voter gets a ballot mailed to them automatically. A study tracking individual voters
                by birth year and prior turnout found turnout rose about {co.overall.effectPp.toFixed(1)} points
                overall — and the gains weren't even.{" "}
                <a href={co.url} target="_blank" rel="noopener noreferrer">
                  Bonica, Grumbach, Hill &amp; Jefferson (2021)
                </a>
                .
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(1)}>
            <div className="voa-step-inner">
              <h3>The rhyme: race</h3>
              <p>
                Every group gained more than the least-affected group. Asian, Black and Latino voters — all
                underrepresented in the national data you just saw — gained more than white voters did.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(2)}>
            <div className="voa-step-inner">
              <h3>And income</h3>
              <p>
                Same shape. The lowest income bracket gained the most; the highest gained the least. It's not that
                all-mail voting is a uniform +8 points everywhere — it's larger exactly where the gap was larger.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(3)}>
            <div className="voa-step-inner">
              <h3>Age shows the same pattern, biggest of all</h3>
              <p>
                The youngest voters — the group furthest below the line in beat one — gained the most from switching
                to all-mail ballots.
              </p>
            </div>
          </div>
          <div className="voa-step" ref={setStepRef(4)}>
            <div className="voa-step-inner">
              <h3>What this doesn't prove</h3>
              <p>
                This is one state, well-identified — not a randomized nationwide experiment. Read the pattern as{" "}
                <em>consistent with</em> all-mail voting closing representation gaps, not as proof it would do the
                same everywhere.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
