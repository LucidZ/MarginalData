import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fmtInt } from "../../I70Crossfilter/format";
import { useData } from "../../I70Crossfilter/useData";
import "../widgets.css";
import HeroChart from "./HeroChart";
import { buildProfiles, DOW_SHORT, DRIFT_WB, fmtPct, seasonLabel as fmtSeason, spanTotal, SPANS, type Mode, type Span } from "./heroData";

// The hero chart candidate for the weekend-warrior story: the average
// January–March day at the Eisenhower Tunnel, hours across, westbound above
// the axis and eastbound below, played back season by season. The chart and
// its data live in HeroChart / heroData, shared with WeekendStory.

const DEFAULT_PINS = [1996, 2013];
const STEP_MS = 450;

export default function HeroCurve() {
  const { data, error } = useData();
  const [span, setSpan] = useState<Span>("sat");
  const [mode, setMode] = useState<Mode>("smooth");
  const [year, setYear] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pins, setPins] = useState<number[]>(DEFAULT_PINS);

  const ds = data?.find((d) => d.days.id === "tunnel") ?? null;
  const profiles = useMemo(() => (ds ? buildProfiles(ds, mode) : null), [ds, mode]);
  const years = useMemo(() => (profiles ? [...profiles.keys()] : []), [profiles]);
  const first = years[0] ?? 1996;
  const last = years[years.length - 1] ?? 2026;
  const cur = year ?? last;

  // Playback: one season per step; stops at the end.
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setYear((y) => {
        const next = (y ?? first) + 1;
        if (next >= last) setPlaying(false);
        return Math.min(next, last);
      });
    }, STEP_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, first, last]);
  const play = () => {
    if (playing) return setPlaying(false);
    if (cur >= last) setYear(first);
    setPlaying(true);
  };

  const dows = SPANS[span].dows;
  const baseYear = first;
  const tCur = profiles ? spanTotal(profiles, cur, dows) : { w: null, e: null, both: null };
  const tBase = profiles ? spanTotal(profiles, baseYear, dows) : { w: null, e: null, both: null };
  const curDays = profiles?.get(cur)?.[dows[0]]?.n ?? 0;
  const seasonLabel = (yr: number) => fmtSeason(yr, mode, first, last);

  const togglePin = (yr: number) =>
    setPins((p) => (p.includes(yr) ? p.filter((v) => v !== yr) : [...p, yr].sort((a, b) => a - b)));

  return (
    <div className="i70w-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← All widgets
      </Link>
      <h1>The winter weekend, season by season</h1>
      <p className="i70w-intro">
        The average January–March day at the Eisenhower Tunnel, hour by hour. Above the line: cars heading west,
        up to the mountains. Below: cars heading east, home to Denver. Press play to run it from 1996 to today.
        Earlier seasons stay behind as a faint trail; pinned seasons stay labeled.
      </p>

      <div className="i70w-controls">
        <button className="i70w-btn" onClick={play} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <label className="i70w-flow">
          Season
          <input
            type="range"
            min={first}
            max={last}
            value={cur}
            aria-label="Season"
            onChange={(e) => {
              setPlaying(false);
              setYear(Number(e.target.value));
            }}
          />
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>{cur}</strong>
        </label>
        <button className="i70w-btn" onClick={() => togglePin(cur)}>
          {pins.includes(cur) ? `Unpin ${cur}` : `Pin ${cur}`}
        </button>
      </div>
      <div className="i70w-controls">
        <div className="i70w-seg" role="group" aria-label="Days shown">
          {(Object.keys(SPANS) as Span[]).map((s) => (
            <button key={s} aria-pressed={span === s} onClick={() => setSpan(s)}>
              {SPANS[s].label}
            </button>
          ))}
        </div>
        <div className="i70w-seg" role="group" aria-label="Smoothing">
          <button aria-pressed={mode === "smooth"} onClick={() => setMode("smooth")}>
            3-season average
          </button>
          <button aria-pressed={mode === "raw"} onClick={() => setMode("raw")}>
            Single season
          </button>
        </div>
      </div>

      {error && <p className="i70w-note">Couldn't load data: {error.message}</p>}

      <p className="i70w-readout" style={{ fontVariantNumeric: "tabular-nums", margin: "0.25rem 0 0.5rem" }}>
        <strong>
          {SPANS[span].label}, {seasonLabel(cur)}:
        </strong>{" "}
        {tCur.both != null ? (
          <>
            {fmtInt(tCur.both)} vehicles both ways
            {tBase.both != null && cur !== baseYear && ` (${fmtPct((tCur.both / tBase.both - 1) * 100)} vs ${baseYear})`}
          </>
        ) : (
          <>
            {tCur.e != null && `${fmtInt(tCur.e)} eastbound; `}westbound unavailable
          </>
        )}
        <span style={{ color: "var(--muted)" }}>
          {" "}
          · {curDays} {dows.length > 1 ? "days per weekday" : `${DOW_SHORT[dows[0]]}s`} averaged
        </span>
      </p>

      {profiles && <HeroChart profiles={profiles} span={span} season={cur} pins={pins} showTrail />}

      <div className="i70w-legend" style={{ marginTop: "0.5rem" }}>
        <span>
          <i style={{ background: "var(--car)" }} />
          {cur}
        </span>
        <span>
          <i style={{ background: "var(--text-secondary)" }} />
          Pinned: {pins.join(", ") || "none"}
        </span>
        <span>
          <i style={{ background: "var(--off)" }} />
          Earlier seasons
        </span>
      </div>

      <p className="i70w-note">
        Eisenhower Tunnel, cars per hour averaged over usable January–March days of each weekday: days missing any
        hour, flagged closures, MLK and Presidents' Day weekends and Jan 1–2 are left out. With the 3-season average
        on, each season blends with the one before and after, weighted by days. Multi-day spans lay each weekday's
        average end to end, so they show a typical week, not a real one. *Westbound {DRIFT_WB.from}–{DRIFT_WB.to} is shown
        as recorded, but the recorder's clock appears to have run up to 1¼ hours early until the counter was serviced
        in May 2010, so those curves likely sit a little early in the day. They're kept out of neighboring seasons'
        averages.
      </p>
    </div>
  );
}
