import { useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { fmtInt } from "../../I70Crossfilter/format";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { useData } from "../../I70Crossfilter/useData";
import "../widgets.css";
import { buildProfiles, DRIFT_WB, fmtPct, type Dir } from "../HeroCurve/heroData";
import LensChart from "./LensChart";
import { buildFacts, CHART_IDS, CHARTS, dayName, LENS_IDS, LENSES, season as seasonOf } from "./lensData";
import { cellText, stepIndexOf, STEPS } from "./steps";
import { useStepProgress } from "./useStepProgress";

// Scrollyteller for "the evolution of the winter weekend warrior": three
// charts (Saturday, Fri–Sun, Wed–Tue), each read through the same three
// lenses (busiest hour, total cars, net up the hill), 1996 against today.
// A 3×3 tracker above the chart fills in as the reader goes.
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
  const pin = scrubbing || view.pin ? first : null;
  const lens = scrubbing ? null : view.lens;

  const cur = profiles ? seasonOf(profiles, season, view.chart) : null;
  const base = profiles ? seasonOf(profiles, first, view.chart) : null;
  const phone = vizWidth > 0 && vizWidth < 560;
  const showPin = pin != null && season !== first;

  const readout = (() => {
    const head = `${CHARTS[view.chart].label}${lens ? ` · ${LENSES[lens].toLowerCase()}` : ""}`;
    if (!cur) return { head, text: "" };
    if (!showPin || !base) return { head, text: `${season}, ${fmtInt(cur.total)} vehicles` };
    if (lens === "net") {
      const sign = (v: number) => `${v < 0 ? "−" : "+"}${fmtInt(Math.abs(v))}`;
      if (CHARTS[view.chart].dailyNet) {
        // The (up to) two days that send the most people up, in week order.
        const fills = (s: typeof cur) =>
          s.dayNet
            .map((v, d) => ({ v, d }))
            .filter(({ v }) => v > 0)
            .sort((a, b) => b.v - a.v)
            .slice(0, 2)
            .sort((a, b) => a.d - b.d)
            .map(({ v, d }) => `${dayName(view.chart, d)} ${sign(v)}`)
            .join(", ");
        return { head, text: `filled by ${first} ${fills(base)} → ${season} ${fills(cur)}` };
      }
      const end = (s: typeof cur) => s.net[s.net.length - 1];
      return { head, text: `${first} ${sign(end(base))} → ${season} ${sign(end(cur))} left up the hill by 3am` };
    }
    const both = `${first} ${fmtInt(base.total)} → ${season} ${fmtInt(cur.total)} vehicles (${fmtPct((cur.total / base.total - 1) * 100)})`;
    if (lens !== "total") return { head, text: both };
    const g = (dir: Dir) => fmtPct((cur.totalDir[dir] / base.totalDir[dir] - 1) * 100);
    return { head, text: `${both} · westbound ${g("wb")}, eastbound ${g("eb")}` };
  })();

  return (
    <div className="i70w-root i70s-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← All widgets
      </Link>
      <h1>The winter weekend warrior</h1>
      <p className="i70w-intro">
        Draft. Thirty winters of traffic through the Eisenhower Tunnel, the gateway from Denver to Summit County's ski
        areas: three charts, each read three ways.
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
            data-lens={lens ?? ""}
            hidden
          />
          {facts && (
            <table className="i70s-tracker" aria-label="Where you are: three charts, three readings">
              <thead>
                <tr>
                  <th />
                  {LENS_IDS.map((l) => (
                    <th key={l} className={l === lens ? "is-on" : undefined}>
                      {LENSES[l]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CHART_IDS.map((c) => (
                  <tr key={c} className={c === view.chart ? "is-on" : undefined}>
                    <th>{CHARTS[c].label}</th>
                    {LENS_IDS.map((l) => {
                      const at = stepIndexOf(c, l);
                      const reached = activeStep >= at;
                      const here = c === view.chart && l === lens;
                      return (
                        <td key={l} className={`${reached ? "is-done" : ""}${here ? " is-here" : ""}`}>
                          {reached ? cellText(facts, c, l) : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="i70w-readout i70s-readout">
            <strong>{readout.head}:</strong> {readout.text}
          </p>
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
              lens={lens}
              height={phone ? 270 : 420}
            />
          )}
        </div>
        <div className="i70s-steps">
          {STEPS.map((s, k) => (
            <div className="i70s-step" key={k} ref={setStepRef(k)}>
              <div className={`i70s-step-inner${k === activeStep ? " is-active" : ""}`}>
                <h3>{s.heading}</h3>
                {facts && s.body(facts, { first, last })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="i70w-note">
        Eisenhower Tunnel (CDOT counter 000106), cars per hour averaged over each season's January–March days, one season
        at a time, so a big or thin snow year shows up as it was. Days missing any hour, flagged closures, MLK and
        Presidents' Day weekends and Jan 1–2 are left out. "Today" is {last}. Each chart runs 3am to 3am, so the night's
        last cars count with the day they belong to, and multi-day charts lay each weekday's average end to end: a
        typical week, not a real one. The net line counts westbound minus eastbound, so it shows the change in vehicles
        west of the tunnel, not the total up there. On Saturday and Fri–Sun it runs from the chart's start; on Wed–Tue it
        starts over at 3am each day. A typical week doesn't net to zero: over a full year the counter's westbound side
        reads 1–2% above eastbound lately (and about 2% below in {first}), and January–March catches the season filling up
        but not all of its drain in late March and April. Reset daily, that leftover stays a few hundred cars a day
        instead of piling up across the week. *Westbound{" "}
        {DRIFT_WB.from}–{DRIFT_WB.to} is shown as recorded, but the counter's clock appears to have run up to 1¼ hours
        early until it was serviced in May 2010.
      </p>
    </div>
  );
}
