import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import PopulationBars, { type PopulationBarRow } from "./PopulationBars";
import YearControl, { type YearOption } from "./YearControl";
import { cohortRows, hopRows } from "./ageRows";
import { fmtM, fmtPct } from "./format";
import { explorerCopy } from "./copy";
import type { DimensionKey, DimensionYear, VoterAgeData } from "./types";

/**
 * Every election by age, after the story: the beat 1-2 chart (eligible,
 * votes, the 65+ line and the gold shortfall) with the year buttons above
 * it. Not scroll-driven - picking a year plays the same cohort hop the
 * story's beat 2 does, once per election in between, on a timer. Bars are
 * keyed by birth cohort (ageRows.ts), so a jump from 2024 to 2012 slides
 * each generation twelve years younger rather than cutting.
 *
 * The dimension switch above the years swaps the age chart for a category
 * one - education, family income or race (byDimension) - drawn the same way
 * but benchmarked to that dimension's best-voting group instead of 65+.
 * Its groups don't move between elections, so a year change plays the same
 * timed hops with every bar holding its slot while its values lerp. A view
 * missing any year just cuts instead, and the absent years' buttons disable.
 *
 * The measure switch under it strips any view down to its gold: each bar's
 * shortfall as a share of all votes cast, on its own pinned percent axis, so
 * the bars sum to the hero figure. The switch plays the story's shortfall
 * summary moves on a timer (measureRows), and reverses them going back.
 */

type View = "age" | DimensionKey;
const VIEWS: View[] = ["age", "education", "income", "race"];

function dimensionRows(y: DimensionYear): PopulationBarRow[] {
  return y.rows.map((r) => ({
    key: r.group,
    x: r.group,
    label: r.short,
    cvap: r.cvap,
    votes: r.votes,
    expected: r.expected,
    missing: r.missing,
    turnout: r.turnout,
  }));
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Category rows between two elections: same groups, same slots, values lerp. */
function blendRows(from: PopulationBarRow[], to: PopulationBarRow[], t: number): PopulationBarRow[] {
  const toByKey = new Map(to.map((r) => [r.key, r]));
  return from.map((r) => {
    const o = toByKey.get(r.key);
    if (!o) return r;
    return {
      ...r,
      cvap: lerp(r.cvap, o.cvap, t),
      votes: lerp(r.votes, o.votes, t),
      expected: lerp(r.expected, o.expected, t),
      missing: lerp(r.missing, o.missing, t),
      turnout: lerp(r.turnout, o.turnout, t),
    };
  });
}

/** The people chart, or each bar's gold alone as a share of all votes cast. */
type Measure = "people" | "gap";
const MEASURES: Measure[] = ["people", "gap"];

/** The shortfall-only view's rows: the gold drawn from the baseline, sized
 * as a share of all votes cast, so the bars sum to the hero figure. Track
 * and votes go to zero; the gold layer spans votes -> expected. */
function gapRows(rows: PopulationBarRow[], totalVotes: number): PopulationBarRow[] {
  return rows.map((r) => {
    const pct = (Math.max(0, -r.missing) / totalVotes) * 100;
    return { ...r, cvap: 0, votes: 0, expected: pct, missing: -pct, registered: undefined };
  });
}

const fmtTickPct = (v: number) => `${v}%`;

/** The people -> shortfall-only switch's length, and its three moves as
 * fractions of it (the story's shortfall summary, PopulationBars pct): the
 * other layers fade, the gold drops to the baseline still in people, then
 * resizes to its percent while the y axes cross-fade. */
const MEASURE_MS = 1400;
const FADE_END = 0.25;
const DROP = [0.25, 0.55] as const;
const RESIZE = [0.6, 1] as const;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const phase = (u: number, [a, b]: readonly [number, number]) => easeInOut(clamp01((u - a) / (b - a)));

/** Rows mid-switch, still on the people axis: each gold block slid down to
 * the baseline, then rescaled toward its percent height - expressed in
 * people, `peopleMax / gapMax` converting, so at u=1 the bars stand exactly
 * where gapRows on the percent axis draws them. */
function measureRows(
  rows: PopulationBarRow[],
  totalVotes: number,
  u: number,
  peopleMax: number,
  gapMax: number
): PopulationBarRow[] {
  const drop = phase(u, DROP);
  if (drop <= 0) return rows; // still fading: the people chart as is
  const resize = phase(u, RESIZE);
  return rows.map((r) => {
    const gold = Math.max(0, -r.missing);
    const g = lerp(gold, ((gold / totalVotes) * 100 * peopleMax) / gapMax, resize);
    const base = r.votes * (1 - drop);
    return { ...r, votes: base, expected: base + g, missing: -g, registered: undefined };
  });
}

/** A radio group of pills, arrow keys move: the dimension and measure switches. */
function PillControl<T extends string>({
  id,
  label,
  options,
  names,
  value,
  onPick,
}: {
  id: string;
  label: string;
  options: T[];
  names: Record<T, string>;
  value: T;
  onPick: (v: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const j = (i + step + options.length) % options.length;
    onPick(options[j]);
    refs.current[j]?.focus();
  };
  return (
    <div className="voa-dims" role="radiogroup" aria-labelledby={id}>
      <span className="voa-dims-label" id={id}>
        {label}
      </span>
      {options.map((v, i) => (
        <button
          key={v}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={v === value}
          tabIndex={v === value ? 0 : -1}
          className="voa-dims-btn"
          onClick={() => onPick(v)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {names[v]}
        </button>
      ))}
    </div>
  );
}

/** One hop's duration. A multi-year jump plays every hop in between. */
const HOP_MS = 450;

// Gentler than the scroll's gamma=3: the timer, not the reader, drives it.
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** Every age that fell short of its cycle's 65+ standard, summed. */
const shortfallOf = (rows: { missing: number }[]) =>
  Math.abs(rows.reduce((s, r) => s + Math.min(0, r.missing), 0));

export default function Explorer({ data }: { data: VoterAgeData }) {
  // Newest first, like AgeBeats: `pos` counts elections back from 2024.
  const years = useMemo(() => Object.keys(data.byAge).sort().reverse(), [data]);
  const restRows = useMemo(() => years.map((y) => cohortRows(data.byAge[y], Number(y))), [data, years]);
  const last = years.length - 1;

  const [view, setView] = useState<View>("age");
  const [measure, setMeasure] = useState<Measure>("people");
  // 0 = people, 1 = shortfall only; in between, the switch is playing.
  const [gapU, setGapU] = useState(0);
  const gapURef = useRef(0);
  const gapOnly = gapU >= 1;
  const switching = gapU > 0 && gapU < 1;
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const raf = useRef(0);
  const measureRaf = useRef(0);
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      cancelAnimationFrame(measureRaf.current);
    },
    []
  );

  const pickMeasure = useCallback((m: Measure) => {
    setMeasure(m);
    const target = m === "gap" ? 1 : 0;
    cancelAnimationFrame(measureRaf.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gapURef.current = target;
      setGapU(target);
      return;
    }
    let prev = performance.now();
    const tick = (now: number) => {
      // Clamped like the hop timer's: a frame stamped before the click.
      const step = Math.max(0, now - prev) / MEASURE_MS;
      prev = now;
      const u = gapURef.current;
      const next = u < target ? Math.min(target, u + step) : Math.max(target, u - step);
      gapURef.current = next;
      setGapU(next);
      if (next !== target) measureRaf.current = requestAnimationFrame(tick);
    };
    measureRaf.current = requestAnimationFrame(tick);
  }, []);

  /** Years the current view has data for; null for age, which has them all. */
  const dimYears = view === "age" ? null : data.byDimension[view].years;
  /** The current category view's rows per election, newest first; null if it lacks any year. */
  const dimRestRows = useMemo(
    () => (dimYears && years.every((y) => dimYears[y]) ? years.map((y) => dimensionRows(dimYears[y])) : null),
    [dimYears, years]
  );

  const pickView = useCallback(
    (v: View) => {
      setView(v);
      if (v === "age") return;
      // Snap to the newest year that view has, if the one shown isn't there.
      // Mid-hop is only fine if the view can blend every year.
      const has = data.byDimension[v].years;
      const at = posRef.current;
      if (Number.isInteger(at) ? has[years[at]] : years.every((y) => has[y])) return;
      const target = years.findIndex((y) => has[y]);
      cancelAnimationFrame(raf.current);
      posRef.current = target;
      setPos(target);
    },
    [data, years]
  );

  const pick = useCallback(
    (year: string) => {
      const target = years.indexOf(year);
      cancelAnimationFrame(raf.current);
      // A category view missing some years has nothing to hop through: cut.
      if ((dimYears && !dimRestRows) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        posRef.current = target;
        setPos(target);
        return;
      }
      let prev = performance.now();
      const tick = (now: number) => {
        // Firefox stamps a frame with its start time, which can precede the
        // performance.now() taken at the click - a negative step would push
        // pos past 2024 to -0.0x and index a row set that doesn't exist.
        const step = Math.max(0, now - prev) / HOP_MS;
        prev = now;
        const p = posRef.current;
        const next = p < target ? Math.min(target, p + step) : Math.max(target, p - step);
        posRef.current = next;
        setPos(next);
        if (next !== target) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [years, dimYears, dimRestRows]
  );

  const hop = Math.min(Math.floor(pos), last - 1);
  const t = ease(pos - hop);
  const peopleRows = useMemo(() => {
    if (t <= 0) return restRows[hop];
    if (t >= 1) return restRows[hop + 1];
    return hopRows(restRows[hop], restRows[hop + 1], t);
  }, [restRows, hop, t]);
  // Same pinned scale as the story's chart, so the two read alike.
  const yDomain = useMemo((): [number, number] => {
    const maxCvap = Math.max(...Object.values(data.byAge).flatMap((c) => c.rows.map((r) => r.cvap)));
    return [0, maxCvap * 1.08];
  }, [data]);
  // The shortfall-only scale, pinned across every year the same way.
  const gapYDomain = useMemo((): [number, number] => {
    const maxPct = Math.max(
      ...Object.values(data.byAge).flatMap((c) => c.rows.map((r) => (Math.max(0, -r.missing) / c.totalVotes) * 100))
    );
    return [0, maxPct * 1.1];
  }, [data]);
  const rows = useMemo(() => {
    if (gapU <= 0) return peopleRows;
    const votes = lerp(data.byAge[years[hop]].totalVotes, data.byAge[years[hop + 1]].totalVotes, t);
    return gapOnly ? gapRows(peopleRows, votes) : measureRows(peopleRows, votes, gapU, yDomain[1], gapYDomain[1]);
  }, [gapU, gapOnly, peopleRows, data, years, hop, t, yDomain, gapYDomain]);

  // Printed numbers snap to a real election, never the lerped rows.
  const shownYear = years[Math.round(pos)];
  const shownCycle = data.byAge[shownYear];
  const resting = Number.isInteger(pos) ? shownYear : null;
  const shownRowsByKey = useMemo(
    () => new Map(restRows[Math.round(pos)].map((r) => [r.key, r])),
    [restRows, pos]
  );

  const options: YearOption[] = useMemo(
    () =>
      [...years]
        .reverse()
        .map((year) => ({ year, kind: data.byAge[year].kind, disabled: dimYears ? !dimYears[year] : false })),
    [years, data, dimYears]
  );

  const tooltipFor = useCallback(
    (row: PopulationBarRow) => {
      if (resting === null) return null; // mid-hop the bars describe no real election
      const real = shownRowsByKey.get(row.key);
      if (!real) return null;
      return (
        <>
          <div className="voa-tooltip__head">
            Age {real.label} · {shownYear}
            {real.ratesPooled ? " (rate shared across 80-84/85+)" : ""}
          </div>
          {fmtM(real.cvap)} eligible
          {` · ${fmtM(real.votes)} voted (${fmtPct(real.turnout)})`}
          <div className="voa-tooltip__note">
            At the {shownYear} 65+ rate ({fmtPct(shownCycle.over65Turnout)}): {fmtM(real.expected)}
          </div>
          {measure === "gap" && real.missing < 0 && (
            <div className="voa-tooltip__note">
              {explorerCopy.gapTip(fmtM(-real.missing), fmtPct((-real.missing / shownCycle.totalVotes) * 100))}
            </div>
          )}
        </>
      );
    },
    [resting, shownRowsByKey, shownYear, shownCycle, measure]
  );

  const vals = { firstYear: years[last] };

  // The non-age view at the shown year (pickView makes sure it exists).
  const dimYear = dimYears?.[shownYear] ?? null;
  // Pinned per view across its years, like the age chart's.
  const dimYDomain = useMemo((): [number, number] => {
    if (!dimYears) return [0, 1];
    const maxCvap = Math.max(...Object.values(dimYears).flatMap((y) => y.rows.map((r) => r.cvap)));
    return [0, maxCvap * 1.08];
  }, [dimYears]);
  const dimGapYDomain = useMemo((): [number, number] => {
    if (!dimYears) return [0, 1];
    const maxPct = Math.max(
      ...Object.values(dimYears).flatMap((y) => y.rows.map((r) => (Math.max(0, -r.missing) / y.totalVotes) * 100))
    );
    return [0, maxPct * 1.1];
  }, [dimYears]);
  const dimBarRows = useMemo(() => {
    let at: PopulationBarRow[], votes: number;
    if (dimRestRows && dimYears) {
      at = t <= 0 ? dimRestRows[hop] : t >= 1 ? dimRestRows[hop + 1] : blendRows(dimRestRows[hop], dimRestRows[hop + 1], t);
      votes = lerp(dimYears[years[hop]].totalVotes, dimYears[years[hop + 1]].totalVotes, t);
    } else if (dimYear) {
      at = dimensionRows(dimYear);
      votes = dimYear.totalVotes;
    } else return [];
    if (gapU <= 0) return at;
    return gapOnly ? gapRows(at, votes) : measureRows(at, votes, gapU, dimYDomain[1], dimGapYDomain[1]);
  }, [dimRestRows, dimYears, dimYear, years, hop, t, gapU, gapOnly, dimYDomain, dimGapYDomain]);

  const dimTooltipFor = useCallback(
    (row: PopulationBarRow) => {
      if (resting === null) return null; // mid-hop the bars describe no real election
      const real = dimYear?.rows.find((r) => r.group === row.key);
      if (!dimYear || !real) return null;
      return (
        <>
          <div className="voa-tooltip__head">
            {real.group} · {shownYear}
          </div>
          {fmtM(real.cvap)} eligible · {fmtM(real.votes)} voted ({fmtPct(real.turnout)})
          <div className="voa-tooltip__note">
            {real.group === dimYear.benchmarkGroup
              ? "Highest turnout: the benchmark"
              : `At ${dimYear.benchmarkGroup.toLowerCase()} turnout (${fmtPct(dimYear.benchmarkTurnout)}): ${fmtM(real.expected)}`}
          </div>
          {measure === "gap" && real.missing < 0 && (
            <div className="voa-tooltip__note">
              {explorerCopy.gapTip(fmtM(-real.missing), fmtPct((-real.missing / dimYear.totalVotes) * 100))}
            </div>
          )}
        </>
      );
    },
    [resting, dimYear, shownYear, measure]
  );

  const benchmarkShort = dimYear?.rows.find((r) => r.group === dimYear.benchmarkGroup)?.short ?? "";
  const dimVals = dimYear && {
    year: shownYear,
    benchmark: dimYear.benchmarkGroup,
    totalGap: fmtPct(100 * (1 - dimYear.totalCvap / shownCycle.totalCvap)),
    imputed: dimYear.imputedPct === undefined ? undefined : fmtPct(dimYear.imputedPct),
  };

  // The layers each measure draws: the full people chart, or the gold alone.
  // Mid-switch the others fade first, and the labels flip with the axes.
  const fade = 1 - clamp01(gapU / FADE_END);
  const pctLabels = gapU >= 0.8;
  const measureProps = {
    yLabel: pctLabels ? explorerCopy.gapYLabel : "People (millions)",
    trackOpacity: fade,
    votesOpacity: fade,
    expectedOpacity: fade,
    gapOpacity: 1,
    // One label for both: the longer percent one wrapped the legend onto a
    // second line mid-switch, dropping the whole plot. The axis says "%".
    gapLegendLabel: "Shortfall",
  };
  /** Mid-switch the chart stays on the people axis, with the percent one
   * cross-fading in over it as the gold resizes. */
  const altAxis = (gap: [number, number]) =>
    switching ? { domain: gap, tickFormat: fmtTickPct, u: clamp01((gapU - RESIZE[0]) / (RESIZE[1] - RESIZE[0])) } : undefined;

  return (
    <section className="voa-explorer">
      <h2 className="voa-beat-title">{explorerCopy.title}</h2>
      {explorerCopy.intro(vals)}
      <div className="voa-explorer-chart">
        {/* State for tests: pos = elections back from 2024. */}
        <span
          className="voa-explorer-state"
          data-pos={pos.toFixed(4)}
          data-resting={resting ?? ""}
          data-view={view}
          data-measure={measure}
          data-gap-u={gapU.toFixed(4)}
          hidden
        />
        <PillControl
          id="voa-dims-label"
          label={explorerCopy.dimsLabel}
          options={VIEWS}
          names={explorerCopy.dims}
          value={view}
          onPick={pickView}
        />
        <PillControl
          id="voa-measure-label"
          label={explorerCopy.measureLabel}
          options={MEASURES}
          names={explorerCopy.measures}
          value={measure}
          onPick={pickMeasure}
        />
        <YearControl
          options={options}
          shown={shownYear}
          resting={resting}
          pos={last - pos}
          opacity={1}
          onPick={pick}
        />
        {dimYear ? (
          <PopulationBars
            key={view}
            rows={dimBarRows}
            xKind="category"
            xLabel={explorerCopy.dims[view]}
            {...measureProps}
            expectedLineLabel={explorerCopy.benchmarkLine(benchmarkShort, fmtPct(dimYear.benchmarkTurnout))}
            heroGap={{
              items: [
                {
                  figure: fmtPct((dimYear.shortfall / dimYear.totalVotes) * 100),
                  label: "shortfall, as a share of votes cast",
                  delta: "",
                  tone: "gap",
                },
                {
                  figure: fmtPct(dimYear.avgTurnout),
                  label: "of eligible citizens voted",
                  delta: "",
                },
              ],
              deltaOpacity: 0,
            }}
            yDomain={gapOnly ? dimGapYDomain : dimYDomain}
            yTickFormat={gapOnly ? fmtTickPct : undefined}
            yAxisAlt={altAxis(dimGapYDomain)}
            transitionMs={0}
            tooltipFor={dimTooltipFor}
          />
        ) : (
          <PopulationBars
            rows={rows}
            xKind="age"
            xLabel="Age"
            {...measureProps}
            expectedLineLabel={`at 65+ turnout (${fmtPct(shownCycle.over65Turnout)})`}
            heroGap={{
              items: [
                {
                  figure: fmtPct((shortfallOf(shownCycle.rows) / shownCycle.totalVotes) * 100),
                  label: "shortfall, as a share of votes cast",
                  delta: "",
                  tone: "gap",
                },
                {
                  figure: fmtPct(shownCycle.avgTurnout),
                  label: "of eligible citizens voted",
                  delta: "",
                },
              ],
              deltaOpacity: 0,
            }}
            yDomain={gapOnly ? gapYDomain : yDomain}
            yTickFormat={gapOnly ? fmtTickPct : undefined}
            yAxisAlt={altAxis(gapYDomain)}
            transitionMs={0}
            tooltipFor={tooltipFor}
          />
        )}
      </div>
      <p className="voa-explorer-caveat">
        {dimVals ? (
          <>
            {explorerCopy.dimCaveat(dimVals)}
            {view === "income" && explorerCopy.incomeCaveat(dimVals)}
          </>
        ) : (
          explorerCopy.caveat(vals)
        )}
      </p>
    </section>
  );
}
