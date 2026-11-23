import { useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { useData } from "../../I70Crossfilter/useData";
import "../widgets.css";
import { buildProfiles, DRIFT_WB } from "../HeroCurve/heroData";
import LensChart from "./LensChart";
import { buildFacts, buildHolidayProfiles, clockHour, departures, holidayLabel, HOLIDAY_POOL } from "./lensData";
import { popGrowth, STEPS } from "./steps";
import TripCompare from "./TripCompare";
import { useStepProgress } from "./useStepProgress";

// Scrollyteller for "the evolution of the winter weekend warrior": three
// charts (Saturday, Fri–Sun, Thu–Mon), 1996 against today, one sentence and
// at most one gold highlight per step; then a sandbox comparing two trips.
// Gameplan: .claude/i70-weekend-warrior-spec.md (main worktree).

const PHONE_QUERY = "(max-width: 720px)";
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
// Where, between one step's centre (0) and the next's (1), scroll-driven
// changes start and finish. Discrete swaps happen at 0.5, inside this gap.
const GAP_START = 0.25;
const GAP_END = 0.85;

export default function WeekendStory() {
  const { data, error } = useData();
  const ds = data?.find((d) => d.days.id === "tunnel") ?? null;
  const profiles = useMemo(() => (ds ? buildProfiles(ds, "raw") : null), [ds]);
  const years = profiles ? [...profiles.keys()] : [];
  const first = years[0] ?? 1996;
  // "Today" is the latest season on its own, weather and all.
  const last = years[years.length - 1] ?? 2026;
  const holiday = useMemo(() => (ds && profiles ? buildHolidayProfiles(ds, first, last) : null), [ds, profiles, first, last]);
  const facts = useMemo(
    () => (profiles && holiday ? buildFacts(profiles, holiday, first, last) : null),
    [profiles, holiday, first, last],
  );
  const dep = facts ? departures(facts) : null;

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

  // Scroll-driven changes run in the gap between two steps' text, never while
  // one is being read: a step's state holds until it has scrolled well past
  // the reading line, and the change is done before the next step arrives.
  const i = Math.floor(progress);
  const u = progress - i;
  const moving = u > GAP_START && !!STEPS[i + 1];
  const t = clamp01((u - GAP_START) / (GAP_END - GAP_START));
  // Between a scrub step and the next, the season plays from 1996 to today.
  const scrubbing = !!STEPS[i]?.scrub && moving;
  // Between a zoom step and the next, the view widens out to the next step's chart.
  const zooming = !!STEPS[i]?.zoom && moving;
  const zoom = zooming ? { from: STEPS[i].chart, t } : null;
  const view = scrubbing ? STEPS[i] : zooming ? STEPS[i + 1] : STEPS[activeStep];
  const season = scrubbing ? Math.round(first + (last - first) * t) : view.season === "first" ? first : last;
  const pin = scrubbing || view.season === "today" ? first : null;
  const hl = scrubbing || zooming || !facts ? null : typeof view.hl === "function" ? view.hl(facts) : view.hl;

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
            data-zoom={zoom ? zoom.t.toFixed(2) : ""}
            hidden
          />
          <div className="i70s-key" aria-hidden>
            <span className="i70s-key-now">{season}</span>
            {showPin && <span className="i70s-key-then">{first}</span>}
            {hl?.kind === "pick" && hl.holidayLine && (
              <span className="i70s-key-hol">MLK & Presidents' Day weekends, {holidayLabel(last, first)}</span>
            )}
          </div>
          {profiles && (
            <LensChart
              profiles={profiles}
              chart={view.chart}
              season={season}
              pin={pin}
              showTrail={scrubbing}
              hl={hl}
              zoom={zoom}
              holiday={holiday}
              holidayName={`MLK & Presidents' Day weekends, ${holidayLabel(last, first)}`}
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

      {profiles && holiday && dep && (
        <TripCompare profiles={profiles} holiday={holiday} first={first} last={last} up={clockHour(dep.thuUp)} home={clockHour(dep.monHome)} />
      )}

      <p className="i70w-note">
        Try other seasons and spans in the <Link to="/2026/I70Widgets/HeroCurve">full chart</Link>.
      </p>
      <p className="i70w-note">
        Eisenhower Tunnel (CDOT counter 000106), cars per hour averaged over each season's January–March days, one season
        at a time, so a big or thin snow year shows up as it was; days missing any hour and flagged closures are left
        out. "Today" is {last}. Each chart runs 3am to 3am, so the night's last cars count with the day they belong to,
        and multi-day charts lay each weekday's average end to end: a typical weekend, not a real one. Holiday weekends
        (Thursday through Monday around MLK and Presidents' Day) are too few in one season to stand alone, so they're
        averaged over {HOLIDAY_POOL} seasons: {holidayLabel(last, first)}, and {holidayLabel(first, first)} for{" "}
        {first}; the ordinary averages include them. Counts are cars through the tunnel each hour, not travel time:
        when traffic backs up, the count stops at what the road can pass. Population: City and County of Denver,
        Census Bureau estimates via FRED, {first}–{popGrowth(first).latest}. *Westbound {DRIFT_WB.from}–{DRIFT_WB.to} is
        shown as recorded, but the counter's clock appears to have run up to 1¼ hours early until it was serviced in
        May 2010.
      </p>
    </div>
  );
}
