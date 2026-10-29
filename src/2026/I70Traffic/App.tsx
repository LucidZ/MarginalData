import { useMemo, useState } from "react";
import { useData } from "./useData";
import { useClock } from "./useClock";
import { useContainerWidth } from "./useContainerWidth";
import { maxCount } from "./scales";
import Controls from "./Controls";
import DayChips from "./DayChips";
import DayHeader from "./DayHeader";
import RoadStrip from "./RoadStrip";
import DailyCurves from "./DailyCurves";
import CurvesLegend from "./CurvesLegend";
import "./App.css";

const DEFAULT_DAYS = ["2023-02-04", "2023-03-11", "2020-04-12", "2020-01-05"];

export default function App() {
  const { data, error } = useData();
  const clock = useClock();
  const [selected, setSelected] = useState<string[]>(DEFAULT_DAYS);
  const [ref, width] = useContainerWidth<HTMLDivElement>();

  const yMax = useMemo(() => (data ? maxCount(data) : 1), [data]);
  // Keep the data file's order, not click order, so the stack doesn't reshuffle.
  const days = useMemo(() => (data ? data.days.filter((d) => selected.includes(d.date)) : []), [data, selected]);
  const toggle = (date: string) =>
    setSelected((s) => (s.includes(date) ? s.filter((d) => d !== date) : [...s, date]));
  // Bars tween for most of an hour's frame, never longer than 600 ms.
  const tweenMs = Math.min(600, clock.speedMs * 0.7);

  return (
    <div className="i70-root" ref={ref}>
      <h1>I-70 Mountain Traffic, Hour by Hour</h1>
      <p className="i70-intro">
        CDOT counts every vehicle that passes four permanent counters on I-70 between Copper Mountain and
        Genesee, hour by hour and in each direction. It doesn't record speed, so 2,000 cars an hour could be
        an open road or a crawl. This toy puts a few contrasting days side by side to see whether the shape
        of a day, across all four counters, tells the two apart. Westbound bars grow up from the road,
        eastbound bars grow down, and every day uses the same scale.
      </p>

      {error && <p className="i70-error">Couldn't load the traffic data: {error.message}</p>}

      {data && (
        <>
          <div className="i70-sticky">
            <Controls {...clock} />
            <DayChips days={data.days} selected={selected} toggle={toggle} />
          </div>

          <section className="i70-strips">
            {days.length === 0 && <p className="i70-empty">Pick a day above.</p>}
            {days.map((d, i) => (
              <div key={d.date} className="i70-strip-wrap">
                <DayHeader day={d} />
                <RoadStrip day={d} stations={data.stations} hour={clock.hour} yMax={yMax} width={width}
                  tweenMs={tweenMs} showLandmarks={i === days.length - 1} />
              </div>
            ))}
          </section>

          {days.length > 0 && (
            <section className="i70-curves-section">
              <h2>The whole day</h2>
              <p className="i70-section-note">
                Vehicles per hour at each counter. The vertical line is the clock above.
              </p>
              <CurvesLegend stations={data.stations} />
              {days.map((d) => (
                <div key={d.date} className="i70-curves-wrap">
                  <h3 className="i70-curves-day">{d.label} <span className="i70-day-date">{d.weekday} {d.date}</span></h3>
                  <DailyCurves day={d} stations={data.stations} hour={clock.hour} yMax={yMax} width={width} />
                </div>
              ))}
            </section>
          )}

          <section className="i70-notes">
            <h2>What you're looking at</h2>
            <ul>
              <li>
                <strong>Cars join between counters.</strong> Ramps at Silverthorne, US-6 (Keystone, A-Basin),
                Loveland, Georgetown and US-40 (Winter Park) at Empire all add traffic, so two counters aren't
                counting the same cars. Expect bars to grow toward Denver: on Jan 5, 2020 the Tunnel counted
                28.7k eastbound and Twin Tunnels 44.2k.
              </li>
              <li>
                <strong>Hourly is coarse.</strong> A freely moving car covers Copper to Genesee (60 miles) in
                about an hour, so on a light day a bump crosses the whole road in one frame. A bump you can
                watch travel is itself a sign of slow traffic. The bars glide between hours for looks, but every
                number shown is a real hourly count.
              </li>
              <li>
                <strong>What a jam looks like in counts.</strong> A count that hits a ceiling and stays flat for
                hours (a mesa, not a peak), and a late tail where downstream counters stay high after upstream
                ones drop. Twin Tunnels eastbound on Jan 5, 2020, 11 AM to 6 PM: 3,382, 3,795, 3,872, 3,863,
                3,429, 3,769, 3,686, 3,530.
              </li>
              <li>
                <strong>Single-hour dips are in the data.</strong> A lone low hour (Genesee eastbound, 6 PM on
                Jan 5, 2020) is plotted as recorded; it may be an incident or a counter glitch.
              </li>
              <li>
                <strong>Weather</strong> comes from NOAA daily reports at Dillon, Georgetown and Loveland Basin.
                Co-op stations report in the morning, so "snowy" means snow fell overnight or during the day.
              </li>
              <li>
                <strong>Mountain counters only.</strong> Four more counters inside metro Denver are left out;
                commuter volumes there would flatten the mountain bars.
              </li>
            </ul>
            <p className="i70-source">
              Source: CDOT OTIS Traffic Data Explorer, continuous count stations, hourly volume by direction.
              Weather: NOAA NCEI GHCN-Daily.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
