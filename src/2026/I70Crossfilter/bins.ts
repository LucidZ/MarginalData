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
const depthKey = edgeKey([1, 6, 12, 24, 36, 48]);

export const TOTAL_STEP = 2500;
const SATURATED_CAP = 10;

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
      id: "snowDepth",
      title: "Snow on the ground (in)",
      measure: "days",
      labels: ["0", "1-6", "6-12", "12-24", "24-36", "36-48", "48+"],
      key: (i) => depthKey(days.snowDepth[i]),
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
    {
      id: "saturated",
      title: "Hours near capacity",
      measure: "days",
      directional: true,
      labels: Array.from({ length: SATURATED_CAP + 1 }, (_, k) => (k === SATURATED_CAP ? `${k}+` : String(k))),
      key: (i, dir) => Math.min(dir === "wb" ? days.wbSaturated[i] : days.ebSaturated[i], SATURATED_CAP),
    },
  ];
};
