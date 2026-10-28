import type { Dataset, Direction } from "./types";
import { MISSING } from "./types";
import { DOW_LABELS, MONTH_LABELS, holidayLabel, weekday } from "./bins";

// "Compare by" groupings. The filter charts only ever scope the days; a
// grouping splits the matching days into one line per group on the hero.
//  - "ab": two groups, the first is the reference the second is measured against
//  - "ordinal": ordered groups, drawn on a one-hue ramp
//  - "nominal": unordered groups, one hue each when there are few enough
//    (MAX_CAT), otherwise faint with hover to highlight
export type GroupingKind = "ab" | "ordinal" | "nominal";

/** Most unordered groups that get their own hue. */
export const MAX_CAT = 4;

export interface Grouping {
  id: string;
  /** The filter it splits on, used as the <optgroup> label. */
  dim: string;
  name: string;
  kind: GroupingKind;
  labels: string[];
  /** Group index for a day, -1 = in no group. */
  groupOf: (day: number) => number;
}

const snowAny = (v: number | null) => (v == null ? -1 : v < 0.1 ? 0 : 1);
const snowLevel = (v: number | null) => (v == null ? -1 : v < 0.1 ? 0 : v < 4 ? 1 : 2);

export const buildGroupings = (data: Dataset): Grouping[] => {
  const { days, dates } = data;
  const firstYear = dates[0].getUTCFullYear();
  const lastYear = dates[dates.length - 1].getUTCFullYear();
  const yearOf = (i: number) => dates[i].getUTCFullYear();
  const star = (y: number) => (y === days.partialYear ? "*" : "");

  const fiveYear: string[] = [];
  for (let y = firstYear; y <= lastYear; y += 5) {
    const end = Math.min(y + 4, lastYear);
    fiveYear.push(y === end ? `${y}${star(y)}` : `${y}-${end}${star(end)}`);
  }

  return [
    {
      id: "dow-each",
      dim: "Day of week",
      name: "Each day",
      kind: "nominal",
      labels: DOW_LABELS,
      groupOf: (i) => weekday(dates[i]),
    },
    {
      id: "dow-weekend",
      dim: "Day of week",
      name: "Weekdays vs weekends",
      kind: "ab",
      labels: ["Weekdays", "Weekend days"],
      groupOf: (i) => (weekday(dates[i]) >= 5 ? 1 : 0),
    },
    {
      id: "month-each",
      dim: "Month",
      name: "Each month",
      kind: "nominal",
      labels: MONTH_LABELS,
      groupOf: (i) => dates[i].getUTCMonth(),
    },
    {
      id: "month-season",
      dim: "Month",
      name: "Seasons",
      kind: "nominal",
      labels: ["Winter (Dec-Feb)", "Spring (Mar-May)", "Summer (Jun-Aug)", "Fall (Sep-Nov)"],
      groupOf: (i) => Math.floor(((dates[i].getUTCMonth() + 1) % 12) / 3),
    },
    {
      id: "year-each",
      dim: "Year",
      name: "Each year",
      kind: "ordinal",
      labels: Array.from({ length: lastYear - firstYear + 1 }, (_, k) => `${firstYear + k}${star(firstYear + k)}`),
      groupOf: (i) => yearOf(i) - firstYear,
    },
    {
      id: "year-five",
      dim: "Year",
      name: "Five-year spans",
      kind: "ordinal",
      labels: fiveYear,
      groupOf: (i) => Math.floor((yearOf(i) - firstYear) / 5),
    },
    {
      id: "year-thennow",
      dim: "Year",
      name: "Then vs now",
      kind: "ab",
      labels: ["1996-2005", "2016-2025"],
      groupOf: (i) => {
        const y = yearOf(i);
        return y <= 2005 ? 0 : y >= 2016 && y <= 2025 ? 1 : -1;
      },
    },
    {
      id: "holiday-each",
      dim: "Holiday period",
      name: "Each holiday",
      kind: "nominal",
      labels: days.holidays.map((h) => (h === "none" ? "No holiday" : holidayLabel(h))),
      groupOf: (i) => days.holiday[i],
    },
    {
      id: "holiday-ab",
      dim: "Holiday period",
      name: "Holiday vs not",
      kind: "ab",
      labels: ["Ordinary days", "Holiday periods"],
      groupOf: (i) => (days.holidays[days.holiday[i]] === "none" ? 0 : 1),
    },
    {
      id: "snowDay-any",
      dim: "Snow",
      name: "During the day: none vs some",
      kind: "ab",
      labels: ["No daytime snow", 'Daytime snow (0.1"+)'],
      groupOf: (i) => snowAny(days.snowDay[i]),
    },
    {
      id: "snowDay-level",
      dim: "Snow",
      name: "During the day: none / light / heavy",
      kind: "ordinal",
      labels: ["No snow", 'Under 4"', '4"+'],
      groupOf: (i) => snowLevel(days.snowDay[i]),
    },
    {
      id: "snowOvernight-any",
      dim: "Snow",
      name: "Overnight: none vs some",
      kind: "ab",
      labels: ["No overnight snow", 'Overnight snow (0.1"+)'],
      groupOf: (i) => snowAny(days.snowOvernight[i]),
    },
    {
      id: "snowOvernight-level",
      dim: "Snow",
      name: "Overnight: none / light / heavy",
      kind: "ordinal",
      labels: ["No snow", 'Under 4"', '4"+'],
      groupOf: (i) => snowLevel(days.snowOvernight[i]),
    },
    {
      id: "storm",
      dim: "Snow",
      name: "Clear vs powder vs storm",
      kind: "nominal",
      labels: ["Clear (no snow)", 'Powder (2"+ overnight, dry day)', 'Storm (2"+ during the day)'],
      groupOf: (i) => {
        const o = days.snowOvernight[i];
        const d = days.snowDay[i];
        if (o == null || d == null) return -1;
        if (d >= 2) return 2;
        if (d < 0.1 && o >= 2) return 1;
        if (d < 0.1 && o < 0.1) return 0;
        return -1;
      },
    },
    {
      id: "precip-any",
      dim: "Precipitation",
      name: "Dry vs wet",
      kind: "ab",
      labels: ["Dry days", "Wet days (0.01\"+)"],
      groupOf: (i) => {
        const v = days.precipDay[i];
        return v == null ? -1 : v < 0.01 ? 0 : 1;
      },
    },
  ];
};

export interface GroupCurve {
  /** Average vehicles per hour, per hour of day. */
  curve: (number | null)[];
  nDays: number;
}

/** Average hourly curve per group over the included days. */
export const groupCurves = (
  data: Dataset,
  include: Uint8Array,
  dir: Direction,
  groupOf: (day: number) => number,
  nGroups: number,
): GroupCurve[] => {
  const src = dir === "wb" ? data.wb : data.eb;
  const sum = Array.from({ length: nGroups }, () => new Float64Array(24));
  const cnt = Array.from({ length: nGroups }, () => new Uint32Array(24));
  const nDays = new Uint32Array(nGroups);
  for (let d = 0; d < data.n; d++) {
    if (!include[d]) continue;
    const g = groupOf(d);
    if (g < 0 || g >= nGroups) continue;
    nDays[g]++;
    const s = sum[g];
    const c = cnt[g];
    for (let h = 0; h < 24; h++) {
      const v = src[d * 24 + h];
      if (v !== MISSING) (s[h] += v), c[h]++;
    }
  }
  return sum.map((s, g) => ({
    curve: Array.from(s, (v, h) => (cnt[g][h] ? v / cnt[g][h] : null)),
    nDays: nDays[g],
  }));
};

/** Average vehicles per day: the curve summed over the chosen hours. */
export const perDay = (curve: (number | null)[], hours: [number, number] | null) => {
  const [a, b] = hours ?? [0, 23];
  let t = 0;
  for (let h = a; h <= b; h++) t += curve[h] ?? 0;
  return t;
};

/** Stroke color for a series; ramp and faint lines mix the direction hue toward the surface. */
export const seriesColor = (s: { style: string; tone: number }, dir: Direction, highlighted = false) => {
  if (s.style === "ref") return "var(--muted)";
  if (s.style === "cat") return `var(--cat-${s.tone + 1})`;
  if (s.style === "main" || highlighted) return `var(--${dir})`;
  const pct = s.style === "ramp" ? Math.round(35 + 65 * s.tone) : 40;
  return `color-mix(in oklab, var(--${dir}) ${pct}%, var(--surface-1))`;
};
