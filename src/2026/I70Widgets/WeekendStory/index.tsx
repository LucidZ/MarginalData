import { useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { fmtInt } from "../../I70Crossfilter/format";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { useData } from "../../I70Crossfilter/useData";
import "../widgets.css";
import HeroChart from "../HeroCurve/HeroChart";
import { buildProfiles, DRIFT_WB, fmtPct, seasonLabel, spanTotal, SPANS } from "../HeroCurve/heroData";
import { STEPS } from "./steps";
import { useStepProgress } from "./useStepProgress";

// Scrollyteller shell for "the evolution of the winter weekend warrior": one
// sticky hero chart, each step changing only its span, season, pin, trail or
// highlight. Scrolling across a `scrub` step plays the seasons 1996 → today.
// Gameplan: .claude/i70-weekend-warrior-spec.md (main worktree).

// "Today" = the 2024–26 centered average. 2026 itself only has 2025 to
// average with, and was a thin-snow season.
const TODAY = 2025;
const PHONE_QUERY = "(max-width: 720px)";
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export default function WeekendStory() {
  const { data, error } = useData();
  const ds = data?.find((d) => d.days.id === "tunnel") ?? null;
  const profiles = useMemo(() => (ds ? buildProfiles(ds, "smooth") : null), [ds]);
  const years = profiles ? [...profiles.keys()] : [];
  const first = years[0] ?? 1996;
  const last = years[years.length - 1] ?? 2026;

  // On phones the chart is pinned across the top, so measure steps against
  // the middle of the band below it (same as the voter-age story).
  const sectionRef = useRef<HTMLElement>(null);
  const coveredTop = useCallback(() => {
    if (!window.matchMedia(PHONE_QUERY).matches) return 0;
    const pane = sectionRef.current?.querySelector<HTMLElement>(".i70s-viz");
    return pane ? Math.min(Math.max(0, pane.getBoundingClientRect().bottom), window.innerHeight * 0.75) : 0;
  }, []);
  const { progress, activeStep, setStepRef } = useStepProgress(STEPS.length, coveredTop);
  const [vizRef, vizWidth] = useContainerWidth<HTMLDivElement>();

  // Between a scrub step and the next, the season follows the scroll; it
  // lands on today a little before the next step reaches the reading line.
  const i = Math.floor(progress);
  const u = progress - i;
  const scrubbing = !!STEPS[i]?.scrub && u > 0;
  const view = scrubbing ? STEPS[i] : STEPS[activeStep];
  const season = scrubbing
    ? Math.round(first + (TODAY - first) * clamp01(u / 0.85))
    : view.season === "first"
      ? first
      : TODAY;
  const pins = scrubbing || view.pin ? [first] : [];
  const showTrail = scrubbing || view.trail;
  const marks = scrubbing ? [] : view.marks;

  const dows = SPANS[view.span].dows;
  const label = (yr: number) => seasonLabel(yr, "smooth", first, last);
  const tCur = profiles ? spanTotal(profiles, season, dows) : null;
  const tBase = profiles ? spanTotal(profiles, first, dows) : null;
  const phone = vizWidth > 0 && vizWidth < 560;

  return (
    <div className="i70w-root i70s-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← All widgets
      </Link>
      <h1>The winter weekend warrior</h1>
      <p className="i70w-intro">
        Draft shell. Thirty winters of traffic through the Eisenhower Tunnel, the gateway from Denver to Summit County's
        ski areas, on one chart.
      </p>
      {error && <p className="i70w-note">Couldn't load data: {error.message}</p>}

      <section className="i70s-scrolly" ref={sectionRef}>
        <div className="i70s-viz" ref={vizRef}>
          {/* Scroll state for tests. */}
          <span
            className="i70s-state"
            data-progress={progress.toFixed(3)}
            data-step={activeStep}
            data-season={season}
            data-span={view.span}
            data-marks={marks?.length ?? 0}
            hidden
          />
          <p className="i70w-readout i70s-readout">
            <strong>
              {SPANS[view.span].label}, {label(season)}:
            </strong>{" "}
            {tCur?.both != null ? (
              <>
                {fmtInt(tCur.both)} vehicles
                {tBase?.both != null && season !== first && ` (${fmtPct((tCur.both / tBase.both - 1) * 100)} vs ${label(first)})`}
              </>
            ) : (
              tCur?.e != null && `${fmtInt(tCur.e)} eastbound`
            )}
          </p>
          {profiles && (
            <HeroChart
              profiles={profiles}
              span={view.span}
              season={season}
              pins={pins}
              showTrail={showTrail}
              marks={marks}
              height={phone ? 270 : 440}
            />
          )}
        </div>
        <div className="i70s-steps">
          {STEPS.map((s, k) => (
            <div className="i70s-step" key={k} ref={setStepRef(k)}>
              <div className={`i70s-step-inner${k === activeStep ? " is-active" : ""}`}>
                <h3>{s.heading}</h3>
                {s.body}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="i70w-note">
        Eisenhower Tunnel (CDOT counter 000106), cars per hour averaged over January–March days, each season blended
        with the one before and after. Days missing any hour, flagged closures, MLK and Presidents' Day weekends and Jan
        1–2 are left out. "1996" is 1996–97 and "today" is 2024–26. Multi-day views lay each weekday's average end to
        end, so they show a typical week, not a real one. Westbound isn't drawn for {DRIFT_WB.from}–{DRIFT_WB.to}{" "}
        because the counter's clock ran up to 1¼ hours early until it was serviced in May 2010.
      </p>
    </div>
  );
}
