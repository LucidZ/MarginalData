import ColoradoDots from "./ColoradoDots";
import StickyViz from "./StickyViz";
import { useActiveStep } from "./useActiveStep";
import { beat4Steps, beat4Sticky, beat4Title, type Beat4Vals } from "./copy";
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

  const copyVals: Beat4Vals = {
    overallEffectPp: co.overall.effectPp.toFixed(1),
    bonicaUrl: co.url,
  };

  return (
    <section className="voa-beat">
      <h2 className="voa-beat-title">{beat4Title}</h2>
      <div className="voa-scrolly">
        <StickyViz>
          {step <= 2 ? (
            <>
              <div className="voa-dim-caption">{activePanel.title}</div>
              <ColoradoDots rows={activePanel.rows} overallEffectPp={co.overall.effectPp} emphasizeGroup={activePanel.emphasize} />
              <p className="voa-dim-note">{beat4Sticky.dotLegend(copyVals.overallEffectPp)}</p>
            </>
          ) : step === 3 ? (
            <div className="voa-callout voa-co-age-card">
              <div className="voa-co-age-figure">+{co.age.youngestCohortEffectPp}pp</div>
              <div>{beat4Sticky.ageCardBody(co.age.relativeIncreasePct, co.age.youngestCohortLabel)}</div>
              <p className="voa-dim-note">{co.age.shapeNote}</p>
            </div>
          ) : (
            <div className="voa-callout">
              <strong>{beat4Sticky.confoundsLabel}</strong>
              <ul className="voa-confound-list">
                {co.confounds.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </StickyViz>
        <div className="voa-scrolly-steps">
          {beat4Steps.map((s, i) => (
            <div className="voa-step" key={i} ref={setStepRef(i)}>
              <div className="voa-step-inner">
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
