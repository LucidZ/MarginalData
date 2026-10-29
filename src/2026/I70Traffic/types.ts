export interface Station {
  id: string;
  name: string;
  mp: number;
  desc: string;
  segment: [number, number];
}

// 24 hourly counts, null per missing hour; the whole direction is null when
// OTIS returned no row for it.
export type HourlySeries = (number | null)[] | null;

export interface StationCounts {
  eb: HourlySeries;
  wb: HourlySeries;
}

export interface WeatherReading {
  station: string;
  date: string;
  snow: number | null;
  prcp: number | null;
  snwd: number | null;
}

export interface Day {
  date: string;
  weekday: string;
  label: string;
  slot: string;
  note: string;
  weather: WeatherReading[];
  counts: Record<string, StationCounts>;
}

export interface TrafficData {
  generated: string;
  source: string;
  stations: Station[];
  days: Day[];
}

export type Direction = "wb" | "eb";
