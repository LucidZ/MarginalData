import { useMemo, useState } from "react";
import { fmtInt, hourLabel } from "../../I70Crossfilter/format";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import type { Dir, Profiles } from "../HeroCurve/heroData";
import LensChart from "./LensChart";
import { CHARTS, hourIndex, holidayLabel, lensSeries, TM, type Pick } from "./lensData";

// The story's closing sandbox: two trips, each a day and hour heading up and
// a day and hour heading home, drawn as whole bars on the Thu–Mon chart (trip
// A gold, B blue) with how many fewer cars one meets than the other at the
// tunnel. Ordinary or holiday weekend, today or 1996.

type UpDay = "thu" | "fri" | "sat";
type HomeDay = "sun" | "mon";
interface Trip {
  upDay: UpDay;
  upHour: number;
  homeDay: HomeDay;
  homeHour: number;
}

const UP_DAYS: [UpDay, string][] = [
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
];
const HOME_DAYS: [HomeDay, string][] = [
  ["sun", "Sun"],
  ["mon", "Mon"],
];
// Departure hours offered: 5am to 10pm, the hours anyone sets out.
const HOURS = Array.from({ length: 18 }, (_, k) => k + 5);
const LONG: Record<UpDay | HomeDay, string> = { thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday", mon: "Monday" };

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
  // One vehicle scale for both weekends, so switching doesn't rescale the bars.
  const yMax = useMemo(() => {
    let mx = 1;
    for (const p of [profiles, holiday])
      for (const yr of p.keys())
        for (const dir of ["wb", "eb"] as const) for (const v of lensSeries(p, yr, CHARTS.thuMon.dows, dir) ?? []) mx = Math.max(mx, v);
    return mx * 1.08;
  }, [profiles, holiday]);

  const at = (t: Trip) => ({ up: hourIndex(TM[t.upDay], t.upHour), home: hourIndex(TM[t.homeDay], t.homeHour) });
  const picks: Pick[] = (["a", "b"] as const).flatMap((k) => {
    const i = at(trips[k]);
    const tag = k.toUpperCase();
    return [
      { dir: "wb" as Dir, i: i.up, tag, tone: k },
      { dir: "eb" as Dir, i: i.home, tag, tone: k },
    ];
  });
  const count = (dir: Dir, i: number) => lensSeries(src, cur, CHARTS.thuMon.dows, dir)?.[i];

  const set = (k: "a" | "b", patch: Partial<Trip>) => setTrips((t) => ({ ...t, [k]: { ...t[k], ...patch } }));

  // One line per direction: both trips' counts, and which meets fewer cars.
  const verdict = (dir: Dir) => {
    const [ia, ib] = [at(trips.a), at(trips.b)].map((i) => (dir === "wb" ? i.up : i.home));
    const [va, vb] = [count(dir, ia), count(dir, ib)];
    if (va == null || vb == null) return null;
    const when = (t: Trip) => (dir === "wb" ? `${LONG[t.upDay]} ${hourWord(t.upHour)}` : `${LONG[t.homeDay]} ${hourWord(t.homeHour)}`);
    const diff = 1 - Math.min(va, vb) / Math.max(va, vb);
    return (
      <p className="i70s-verdict">
        <strong>{dir === "wb" ? "Heading up" : "Heading home"}:</strong>{" "}
        <span className="i70s-tag-a">A</span> {when(trips.a)}, {fmtInt(va)} cars an hour ·{" "}
        <span className="i70s-tag-b">B</span> {when(trips.b)}, {fmtInt(vb)}.{" "}
        {diff < 0.03 ? (
          "About the same."
        ) : (
          <>
            <span className={va < vb ? "i70s-tag-a" : "i70s-tag-b"}>{va < vb ? "A" : "B"}</span> meets{" "}
            {Math.round(diff * 100)}% fewer.
          </>
        )}
      </p>
    );
  };

  const tripCard = (k: "a" | "b") => {
    const t = trips[k];
    return (
      <fieldset className={`i70s-trip is-${k}`} key={k}>
        <legend>Trip {k.toUpperCase()}</legend>
        <div className="i70w-controls">
          <span className="i70s-trip-dir">Up</span>
          <div className="i70w-seg" role="group" aria-label={`Trip ${k.toUpperCase()} day up`}>
            {UP_DAYS.map(([d, l]) => (
              <button key={d} aria-pressed={t.upDay === d} onClick={() => set(k, { upDay: d })}>
                {l}
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
            {HOME_DAYS.map(([d, l]) => (
              <button key={d} aria-pressed={t.homeDay === d} onClick={() => set(k, { homeDay: d })}>
                {l}
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
        Pick when you'd reach the tunnel each way on two trips, and see how many cars you'd be sharing it with.
      </p>
      <div className="i70s-trips">{(["a", "b"] as const).map(tripCard)}</div>
      <div className="i70w-controls">
        <div className="i70w-seg" role="group" aria-label="Weekend">
          <button aria-pressed={!holidayWknd} onClick={() => setHolidayWknd(false)}>
            Ordinary weekend
          </button>
          <button aria-pressed={holidayWknd} onClick={() => setHolidayWknd(true)}>
            {phone ? "MLK / Presidents' Day" : "MLK or Presidents' Day weekend"}
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
      <div className="i70s-key" aria-hidden>
        <span className="i70s-key-now">{name(cur)}</span>
        {era === "today" && <span className="i70s-key-then">{name(first)}</span>}
      </div>
      <LensChart
        profiles={src}
        chart="thuMon"
        season={cur}
        pin={era === "today" ? first : null}
        showTrail={false}
        hl={{ kind: "pick", picks }}
        seasonName={name}
        yMax={yMax}
        height={phone ? 300 : 420}
      />
      <div className="i70s-verdicts">
        {verdict("wb")}
        {verdict("eb")}
      </div>
      <p className="i70w-note">
        Cars per hour through the tunnel, not travel time: when traffic jams, the count stops at what the road can
        pass, so the worst hours look flatter than they feel. The hour is when you'd reach the tunnel, not when you'd
        leave home.
      </p>
    </section>
  );
}
