// Shape of public/data/i70-crossfilter/days.json (columnar, one entry per
// day from `start` to `end`). Written by scripts/generate_i70_crossfilter_data.py.
export interface DaysFile {
  start: string;
  end: string;
  partialYear: number;
  holidays: string[];
  wxStations: string[];
  ceilings: Record<string, { wb: number; eb: number }>;
  holiday: number[];
  holidayPos: string[];
  snowOvernight: (number | null)[];
  snowDay: (number | null)[];
  precipDay: (number | null)[];
  snowDepth: (number | null)[];
  wxStation: number[];
  wbTotal: (number | null)[];
  ebTotal: (number | null)[];
  wbSaturated: number[];
  ebSaturated: number[];
  closure: number[];
  netFlow: (number | null)[];
  complete: number[];
}

export type Direction = "wb" | "eb";

export interface Dataset {
  days: DaysFile;
  n: number;
  /** UTC midnight of each day. */
  dates: Date[];
  /** Hourly counts, index = day * 24 + hour, MISSING = no data. */
  wb: Uint16Array;
  eb: Uint16Array;
}

export const MISSING = 65535;

export type FilterId =
  | "dow"
  | "month"
  | "year"
  | "holiday"
  | "snowOvernight"
  | "snowDay"
  | "precipDay"
  | "snowDepth"
  | "total"
  | "saturated";

export interface BinSpec {
  id: FilterId;
  title: string;
  /** "avg" = average vehicles per matching day; "days" = count of matching days. */
  measure: "avg" | "days";
  labels: string[];
  /** Bin key for a day, -1 = no data (never drawn). */
  key: (day: number, dir: Direction) => number;
  /** True when the key depends on the direction. */
  directional?: boolean;
}

export interface BinValue {
  value: number;
  days: number;
}

export interface Snapshot {
  bars: Record<FilterId, BinValue[]>;
  /** Average vehicles per hour over matching days, per hour of day. */
  hero: (number | null)[];
  /** Same over every day that passes the closure / incomplete toggles. */
  baseline: (number | null)[];
  /** 1 if the day matches every filter. */
  matched: Uint8Array;
  nMatched: number;
  /** Busiest matching days in the current direction, day indices. */
  top: number[];
  /** How long the last filter + read took, ms. */
  ms: number;
}

export type Selection = Set<number> | null;

export interface Filters {
  bins: Record<FilterId, Selection>;
  hours: [number, number] | null;
  includeClosures: boolean;
  includeIncomplete: boolean;
}
