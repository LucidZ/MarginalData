import type { Dataset, FilterId, Selection } from "./types";

// One-click questions: scope filters plus a "Compare by" grouping.
export interface Preset {
  id: string;
  label: string;
  bins: Partial<Record<FilterId, Selection>>;
  compare: string;
}

const range = (a: number, b: number) => new Set(Array.from({ length: b - a + 1 }, (_, k) => a + k));

const SAT = new Set([5]);
const SUN = new Set([6]);
const WEEKEND = new Set([5, 6]);
const SKI_MONTHS = new Set([11, 0, 1, 2]); // Dec-Mar

export const buildPresets = (data: Dataset): Preset[] => {
  const firstYear = data.dates[0].getUTCFullYear();
  const lastYear = data.dates[data.n - 1].getUTCFullYear();
  const since = (y: number) => range(y - firstYear, lastYear - firstYear);

  return [
    {
      id: "snowy-weekends",
      label: "Snowy vs clear winter weekends",
      bins: { dow: WEEKEND, month: SKI_MONTHS, year: since(2015) },
      compare: "snowDay-any",
    },
    {
      id: "powder-storm",
      label: "Powder vs storm Saturdays",
      bins: { dow: SAT, month: SKI_MONTHS },
      compare: "storm",
    },
    {
      id: "ski-weekend",
      label: "Ski-season weekends vs weekdays",
      bins: { month: SKI_MONTHS, year: since(2015) },
      compare: "dow-weekend",
    },
    {
      id: "then-now",
      label: "Winter weekends, then vs now",
      bins: { dow: WEEKEND, month: SKI_MONTHS },
      compare: "year-thennow",
    },
    {
      id: "every-year",
      label: "Winter Saturdays, every year",
      bins: { dow: SAT, month: SKI_MONTHS },
      compare: "year-each",
    },
    {
      id: "sunday-seasons",
      label: "Sundays by season",
      bins: { dow: SUN, year: since(2015) },
      compare: "month-season",
    },
    {
      id: "holiday-weekends",
      label: "Holiday vs ordinary weekends",
      bins: { dow: WEEKEND, year: since(2015) },
      compare: "holiday-ab",
    },
  ];
};
