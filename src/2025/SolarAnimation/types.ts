export interface IntradayDataPoint {
  minute_of_day: number;
  mw: number;
}

export interface DailyTotal {
  date: string;
  total_mwh: number;
  day_index: number;
}

export interface KeyDate {
  date: string;
  label: string;
  commentary: string;
}

export interface SolarAnimationData {
  metadata: {
    year: number;
    total_days: number;
    interval_minutes: number;
    is_leap_year: boolean;
  };
  daily_totals: DailyTotal[];
  intraday_curves: Record<string, IntradayDataPoint[]>;
  key_dates: KeyDate[];
}
