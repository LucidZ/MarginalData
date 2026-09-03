export interface MeanClassification {
  smokeGroup: string;
  changeGroup: string;
  breakYearMid: number | null;
}

export interface ExtremeClassification {
  smokeInfluenced: boolean;
}

export interface StateTrend {
  abbr: string;
  name: string;
  row: number;
  col: number;
  region: string | null;
  years: number[];
  totalPM: (number | null)[];
  nonsmokePM: (number | null)[];
  totalExtremeDays: (number | null)[];
  nonsmokeExtremeDays: (number | null)[];
  meanClass?: MeanClassification;
  extremeClass?: ExtremeClassification;
}

export interface WildfireDataset {
  generatedFrom: string;
  meanBreakYear: number;
  extremeBreakYear: number;
  states: StateTrend[];
  startYear?: number;
  extendedThroughYear?: number;
  smokeDataThroughYear?: number;
}

export type Metric = "mean" | "extreme";

// Our own 3-tier severity read for the "mean" metric's tile tint — see
// chartGeometry's smokeShare for the ranking + boundary reasoning. Two maps
// because a tile's background wash and a badge's dot need different
// treatment for the "clear" tier: transparent so an unaffected tile shows
// no wash at all, vs. a visible muted dot so the badge doesn't disappear.
export type SmokeShareTier = "clear" | "orange" | "red";

export const SMOKE_SHARE_TINT: Record<SmokeShareTier, string> = {
  red: "var(--status-critical)",
  orange: "var(--status-warning)",
  clear: "transparent",
};

export const SMOKE_SHARE_SWATCH: Record<SmokeShareTier, string> = {
  red: "var(--status-critical)",
  orange: "var(--status-warning)",
  clear: "var(--muted)",
};

export const SMOKE_SHARE_WORD: Record<SmokeShareTier, string> = {
  red: "high",
  orange: "moderate",
  clear: "low",
};
