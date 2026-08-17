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
  totalExtremePct: (number | null)[];
  nonsmokeExtremePct: (number | null)[];
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

// Severity tiers for the "mean" metric, ordered worst-to-best — each maps to
// a fixed status color (never re-themed) rather than the paper's arbitrary
// purple/red/orange/yellow, since this classification IS a severity scale.
export const SMOKE_GROUP_SEVERITY: Record<string, "critical" | "serious" | "warning" | "neutral"> = {
  "smoke-caused reversal": "critical",
  "smoke-influenced reversal": "serious",
  "smoke-influenced stagnation": "warning",
  "smoke-influenced,\nno sig. trend change": "warning",
  "smoke-influenced,\nno early decline": "neutral",
  "no smoke influence detected": "neutral",
};

export const SMOKE_GROUP_LABEL: Record<string, string> = {
  "smoke-caused reversal": "Smoke-caused reversal",
  "smoke-influenced reversal": "Smoke-influenced reversal",
  "smoke-influenced stagnation": "Smoke-influenced stagnation",
  "smoke-influenced,\nno sig. trend change": "Smoke-influenced, no clear trend",
  "smoke-influenced,\nno early decline": "Smoke-influenced, no early decline",
  "no smoke influence detected": "No smoke influence detected",
};
