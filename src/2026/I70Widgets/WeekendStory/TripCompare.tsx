import { useMemo, useState } from "react";
import { fmtInt, hourLabel } from "../../I70Crossfilter/format";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import type { Dir, Profiles } from "../HeroCurve/heroData";
import ClockPanel from "./ClockPanel";
import LensChart from "./LensChart";
import { CHARTS, hourIndex, holidayLabel, lensSeries, type Pick } from "./lensData";

// The story's closing sandbox: two trips, each a day and hour heading up and
// a day and hour heading home, any days of the week in any order (home on an
// earlier weekday is a later week's, for a stay of a week or more). Each leg
// gets a clock panel laying the two trips' days over each other (trip A gold,
// B blue), a scoreboard sets the two trips' counts side by side, and the week
// chart shows where the four hours sit. Ordinary or holiday week, today or 1996. Counts are how many
// people chose the same hour, not time in traffic: once the road is full the
// count stops rising, so no percentages or totals.

const DAYS = ["wed", "thu", "fri", "sat", "sun", "mon", "tue"] as const;
type Day = (typeof DAYS)[number];
interface Trip {
  upDay: Day;
  upHour: number;
  homeDay: Day;
  homeHour: number;
}

/** A day's place in the week chart. */
const WK = Object.fromEntries(DAYS.map((d, k) => [d, k])) as Record<Day, number>;
const SHORT: Record<Day, string> = { wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun", mon: "Mon", tue: "Tue" };
const LONG: Record<Day, string> = {
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
};
// Departure hours offered: 5am to 10pm, the hours anyone sets out.
const HOURS = Array.from({ length: 18 }, (_, k) => k + 5);
interface Props {
  profiles: Profiles;
  holiday: Profiles;
  first: number;
  last: number;
  /** The story's departure hours, to start the two trips from. */
  up: number;
  home: number;
}

const hourWord = (h: number) => (h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h}am` : `${h - 12}pm`);

export default function TripCompare({ profiles, holiday, first, last, up, home }: Props) {
  const [trips, setTrips] = useState<Record<"a" | "b", Trip>>({
    a: { upDay: "thu", upHour: up, homeDay: "mon", homeHour: home },
    b: { upDay: "fri", upHour: up, homeDay: "sun", homeHour: home },
  });
  const [holidayWknd, setHolidayWknd] = useState(false);
  const [era, setEra] = useState<"today" | "first">("today");
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const phone = width > 0 && width < 560;

  const src = holidayWknd ? holiday : profiles;
  const cur = era === "today" ? last : first;
  const name = (yr: number) => (holidayWknd ? holidayLabel(yr, first) : String(yr));
  // One vehicle scale for both kinds of week, so switching doesn't rescale the bars.
  const yMax = useMemo(() => {
    let mx = 1;
    for (const p of [profiles, holiday])
      for (const yr of p.keys())
        for (const dir of ["wb", "eb"] as const) for (const v of lensSeries(p, yr, CHARTS.week.dows, dir) ?? []) mx = Math.max(mx, v);
    return mx * 1.08;
  }, [profiles, holiday]);

  const at = (t: Trip) => ({ up: hourIndex(WK[t.upDay], t.upHour), home: hourIndex(WK[t.homeDay], t.homeHour) });
  const picks: Pick[] = (["a", "b"] as const).flatMap((k) => {
    const i = at(trips[k]);
    const tag = k.toUpperCase();
    return [
      { dir: "wb" as Dir, i: i.up, tag, tone: k },
      { dir: "eb" as Dir, i: i.home, tag, tone: k },
    ];
  });
  const count = (dir: Dir, i: number) => lensSeries(src, cur, CHARTS.week.dows, dir)?.[i];

  const set = (k: "a" | "b", patch: Partial<Trip>) => setTrips((t) => ({ ...t, [k]: { ...t[k], ...patch } }));

  // Each trip's cars an hour at the tunnel each way.
  const legVals = (k: "a" | "b") => {
    const i = at(trips[k]);
    return { up: count("wb", i.up), home: count("eb", i.home) };
  };
  const vals = { a: legVals("a"), b: legVals("b") };
  const when = (t: Trip, leg: "up" | "home") =>
    leg === "up" ? `${LONG[t.upDay]} ${hourWord(t.upHour)}` : `${LONG[t.homeDay]} ${hourWord(t.homeHour)}`;
  // One row a leg: a bar per trip, on the panels' scale.
  const scoreRow = (leg: "up" | "home", label: string) => (
    <div className="i70s-score-row" key={leg}>
      <div className="i70s-score-label">
        <strong>{label}</strong>
      </div>
      <div className="i70s-score-bars">
        {(["a", "b"] as const).map((k) => {
          const v = vals[k][leg];
          return (
            <div className={`i70s-score-bar is-${k}`} key={k}>
              <span className="i70s-score-tag">{k.toUpperCase()}</span>
              <span className="i70s-score-track">
                <span className="i70s-score-fill" style={{ width: `${v == null ? 0 : (100 * v) / yMax}%` }} />
              </span>
              <span className="i70s-score-val">
                {v == null ? "–" : fmtInt(v)} <small>{when(trips[k], leg)}</small>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
  const dow = (d: Day) => CHARTS.week.dows[WK[d]];

  const tripCard = (k: "a" | "b") => {
    const t = trips[k];
    return (
      <fieldset className={`i70s-trip is-${k}`} key={k}>
        <legend>Trip {k.toUpperCase()}</legend>
        <div className="i70w-controls">
          <span className="i70s-trip-dir">Up</span>
          <div className="i70w-seg" role="group" aria-label={`Trip ${k.toUpperCase()} day up`}>
            {DAYS.map((d) => (
              <button key={d} aria-pressed={t.upDay === d} onClick={() => set(k, { upDay: d })}>
                {SHORT[d]}
              </button>
            ))}
          </div>
          <select aria-label={`Trip ${k.toUpperCase()} hour up`} value={t.upHour} onChange={(e) => set(k, { upHour: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
        <div className="i70w-controls">
          <span className="i70s-trip-dir">Home</span>
          <div className="i70w-seg" role="group" aria-label={`Trip ${k.toUpperCase()} day home`}>
            {DAYS.map((d) => (
              <button key={d} aria-pressed={t.homeDay === d} onClick={() => set(k, { homeDay: d })}>
                {SHORT[d]}
              </button>
            ))}
          </div>
          <select aria-label={`Trip ${k.toUpperCase()} hour home`} value={t.homeHour} onChange={(e) => set(k, { homeHour: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
    );
  };

  return (
    <section className="i70s-compare" ref={wrapRef}>
      <h2>Compare two trips</h2>
      <p className="i70w-intro">
        Pick when you'd reach the tunnel each way on two trips, any days of the week, and see how many other people
        picked the same hour.
      </p>
      <div className="i70s-trips">{(["a", "b"] as const).map(tripCard)}</div>
      <div className="i70w-controls">
        <div className="i70w-seg" role="group" aria-label="Weekend">
          <button aria-pressed={!holidayWknd} onClick={() => setHolidayWknd(false)}>
            Ordinary week
          </button>
          <button aria-pressed={holidayWknd} onClick={() => setHolidayWknd(true)}>
            {phone ? "MLK / Presidents' Day" : "MLK or Presidents' Day week"}
          </button>
        </div>
        <div className="i70w-seg" role="group" aria-label="Season">
          <button aria-pressed={era === "today"} onClick={() => setEra("today")}>
            {name(last)}
          </button>
          <button aria-pressed={era === "first"} onClick={() => setEra("first")}>
            {name(first)}
          </button>
        </div>
      </div>
      <div className="i70s-clocks">
        {(["wb", "eb"] as const).map((dir) => {
          const leg = (t: Trip) =>
            dir === "wb" ? { dow: dow(t.upDay), hour: t.upHour, day: SHORT[t.upDay] } : { dow: dow(t.homeDay), hour: t.homeHour, day: SHORT[t.homeDay] };
          return (
            <ClockPanel
              key={dir}
              profiles={src}
              season={cur}
              dir={dir}
              title={dir === "wb" ? "Heading up" : "Heading home"}
              a={leg(trips.a)}
              b={leg(trips.b)}
              yMax={yMax}
              height={phone ? 190 : 220}
            />
          );
        })}
      </div>
      <div className="i70s-score">
        <p className="i70s-score-caption">Cars an hour through the tunnel when you'd reach it.</p>
        {scoreRow("up", "Heading up")}
        {scoreRow("home", "Heading home")}
      </div>
      <h3 className="i70s-compare-sub">Where they sit in the week</h3>
      <div className="i70s-key" aria-hidden>
        <span className="i70s-key-now">{name(cur)}</span>
        {era === "today" && <span className="i70s-key-then">{name(first)}</span>}
      </div>
      <LensChart
        profiles={src}
        chart="week"
        season={cur}
        pin={era === "today" ? first : null}
        showTrail={false}
        hl={{ kind: "pick", picks }}
        seasonName={name}
        yMax={yMax}
        height={phone ? 260 : 340}
      />
      <p className="i70w-note">
        These are cars through the tunnel, not time in traffic. Once the road is full, the count stops rising at what
        it can pass and the extra cars wait in line instead, so the busiest hours look flatter than they drive, and
        twice the cars can mean far more than twice the wait, or none. A lower count is a quieter hour; how much
        quieter, in minutes, the count can't say. The hour is when you'd reach the tunnel, not when you'd leave home.
      </p>
    </section>
  );
}
