import { bisectRight } from "d3";
import type { BinSpec, Dataset } from "./types";

const HOLIDAY_LABELS: Record<string, string> = {
  none: "None",
  mlk: "MLK",
  presidents: "Presidents",
  memorial: "Memorial",
  july4: "July 4",
  labor: "Labor",
  thanksgiving: "Thanksgiving",
  xmas_ny: "Xmas-NY",
};

const edgeKey = (edges: number[]) => (v: number | null) => (v == null ? -1 : bisectRight(edges, v));

const snowKey = edgeKey([0.1, 1, 2, 4, 6, 8, 12]);
const SNOW_LABELS = ["0", "<1", "1-2", "2-4", "4-6", "6-8", "8-12", "12+"];
const precipKey = edgeKey([0.01, 0.1, 0.25, 0.5, 1]);

export const TOTAL_STEP = 2500;

/** Monday-first weekday, 0 = Mon. */
export const weekday = (d: Date) => (d.getUTCDay() + 6) % 7;
export const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const holidayLabel = (name: string) => HOLIDAY_LABELS[name] ?? name;

export const buildBins = (data: Dataset): BinSpec[] => {
  const { days, dates } = data;
  const firstYear = dates[0].getUTCFullYear();
  const lastYear = dates[dates.length - 1].getUTCFullYear();
  const maxTotal = Math.max(
    ...days.wbTotal.map((v) => v ?? 0),
    ...days.ebTotal.map((v) => v ?? 0),
  );
  const nTotal = Math.floor(maxTotal / TOTAL_STEP) + 1;

  return [
    {
      id: "dow",
      title: "Day of week",
      measure: "avg",
      labels: DOW_LABELS,
      key: (i) => weekday(dates[i]),
    },
    {
      id: "month",
      title: "Month",
      measure: "avg",
      labels: MONTH_LABELS,
      key: (i) => dates[i].getUTCMonth(),
    },
    {
      id: "year",
      title: "Year",
      measure: "avg",
      labels: Array.from({ length: lastYear - firstYear + 1 }, (_, k) =>
        String(firstYear + k) + (firstYear + k === days.partialYear ? "*" : ""),
      ),
      key: (i) => dates[i].getUTCFullYear() - firstYear,
    },
    {
      id: "holiday",
      title: "Holiday period",
      measure: "avg",
      labels: days.holidays.map(holidayLabel),
      key: (i) => days.holiday[i],
    },
    {
      id: "snowOvernight",
      title: "Snow overnight (in)",
      measure: "days",
      labels: SNOW_LABELS,
      key: (i) => snowKey(days.snowOvernight[i]),
    },
    {
      id: "snowDay",
      title: "Snow during the day (in)",
      measure: "days",
      labels: SNOW_LABELS,
      key: (i) => snowKey(days.snowDay[i]),
    },
    {
      id: "precipDay",
      title: "Precipitation during the day (in)",
      measure: "days",
      labels: ["0", "<0.1", "0.1-.25", ".25-.5", ".5-1", "1+"],
      key: (i) => precipKey(days.precipDay[i]),
    },
    {
      id: "total",
      title: "Daily total (vehicles)",
      measure: "days",
      directional: true,
      labels: Array.from({ length: nTotal }, (_, k) => `${(k * TOTAL_STEP) / 1000}k`),
      key: (i, dir) => {
        const t = dir === "wb" ? days.wbTotal[i] : days.ebTotal[i];
        return t == null ? -1 : Math.floor(t / TOTAL_STEP);
      },
    },
  ];
};

/** "Month: Jan to Mar · Snow overnight (in): 4-6 to 12+" for a set of bin selections. */
export const describeBins = (specs: BinSpec[], bins: Record<string, Set<number> | null>) =>
  specs
    .filter((s) => bins[s.id] != null)
    .map((s) => {
      const keys = [...bins[s.id]!].sort((a, b) => a - b);
      // Collapse runs of 3+ adjacent bins into "first to last".
      const parts: string[] = [];
      for (let i = 0; i < keys.length; ) {
        let j = i;
        while (j + 1 < keys.length && keys[j + 1] === keys[j] + 1) j++;
        if (j - i >= 2) parts.push(`${s.labels[keys[i]]} to ${s.labels[keys[j]]}`);
        else for (let k = i; k <= j; k++) parts.push(s.labels[keys[k]]);
        i = j + 1;
      }
      return `${s.title}: ${parts.join(", ")}`;
    })
    .join(" · ");
