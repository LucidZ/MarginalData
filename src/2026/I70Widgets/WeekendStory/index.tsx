import { useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { useData } from "../../I70Crossfilter/useData";
import "../widgets.css";
import { buildProfiles, DRIFT_WB } from "../HeroCurve/heroData";
import LensChart from "./LensChart";
import { buildFacts } from "./lensData";
import { popGrowth, STEPS } from "./steps";
import { useStepProgress } from "./useStepProgress";

// Scrollyteller for "the evolution of the winter weekend warrior": three
// charts (Saturday, Fri–Sun, Wed–Tue), 1996 against today, one sentence and
// at most one gold highlight per step.
// Gameplan: .claude/i70-weekend-warrior-spec.md (main worktree).

const PHONE_QUERY = "(max-width: 720px)";
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export default function WeekendStory() {
  const { data, error } = useData();
  const ds = data?.find((d) => d.days.id === "tunnel") ?? null;
  const profiles = useMemo(() => (ds ? buildProfiles(ds, "raw") : null), [ds]);
  const years = profiles ? [...profiles.keys()] : [];
  const first = years[0] ?? 1996;
  // "Today" is the latest season on its own, weather and all.
  const last = years[years.length - 1] ?? 2026;
  const facts = useMemo(() => (profiles ? buildFacts(profiles, first, last) : null), [profiles, first, last]);

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
    ? Math.round(first + (last - first) * clamp01(u / 0.85))
    : view.season === "first"
      ? first
      : last;
  const pin = scrubbing || view.season === "today" ? first : null;
  const hl = scrubbing ? null : view.hl;

  const phone = vizWidth > 0 && vizWidth < 560;
  const showPin = pin != null && season !== first;

  return (
    <div className="i70w-root i70s-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← All widgets
      </Link>
      <h1>The winter weekend warrior</h1>
      <p className="i70w-intro">
        Draft. Thirty winters of traffic through the Eisenhower Tunnel, the gateway from Denver to Summit County's ski
        areas.
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
            data-chart={view.chart}
            data-hl={hl?.kind ?? ""}
            hidden
          />
          <div className="i70s-key" aria-hidden>
            <span className="i70s-key-now">{season}</span>
            {showPin && <span className="i70s-key-then">{first}</span>}
          </div>
          {profiles && (
            <LensChart
              profiles={profiles}
              chart={view.chart}
              season={season}
              pin={pin}
              showTrail={scrubbing}
              hl={hl}
              height={phone ? 270 : 420}
            />
          )}
        </div>
        <div className="i70s-steps">
          {STEPS.map((s, k) => (
            <div className="i70s-step" key={k} ref={setStepRef(k)}>
              <p className={`i70s-step-inner${k === activeStep ? " is-active" : ""}`}>
                {facts && s.text(facts, { first, last })}
              </p>
            </div>
          ))}
        </div>
      </section>

      <p className="i70w-note">
        Try other seasons and spans in the <Link to="/2026/I70Widgets/HeroCurve">full chart</Link>.
      </p>
      <p className="i70w-note">
        Eisenhower Tunnel (CDOT counter 000106), cars per hour averaged over each season's January–March days, one season
        at a time, so a big or thin snow year shows up as it was; days missing any hour and flagged closures are left
        out. "Today" is {last}. Each chart runs 3am to 3am, so the night's last cars count with the day they belong to,
        and multi-day charts lay each weekday's average end to end: a typical week, not a real one. The net line is
        westbound minus eastbound, the change in vehicles west of the tunnel, not the total up there, and it starts over
        at 3am each day. A typical week doesn't net to zero: the counter's
        westbound side reads 1–2% above eastbound lately (about 2% below in {first}), and January–March catches the
        season filling up but not all of its drain in late March and April. Population: City and County of Denver,
        Census Bureau estimates via FRED, {first}–{popGrowth(first).latest}. *Westbound {DRIFT_WB.from}–{DRIFT_WB.to} is
        shown as recorded, but the counter's clock appears to have run up to 1¼ hours early until it was serviced in
        May 2010.
      </p>
    </div>
  );
}
