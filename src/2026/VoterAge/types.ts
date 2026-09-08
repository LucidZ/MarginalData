// Mirrors public/data/voter-age.json, produced by
// scripts/generate_voter_age_data.py. See .claude/voter-age-spec.md for the
// full derivation and the integrity guardrails these fields exist to serve.

export interface SingleYearRow {
  age: number; // 87 = representative x-position for the pooled "85+" row
  ageLabel: string; // "85+" for the pooled row, else the literal age
  /** True for ages 80-84 - the Census source only reports these five
   * years pooled as "80-84 years", so each row here holds that bucket's
   * per-year average (total / 5) rather than an individually reported
   * figure. */
  approxFromBucket?: boolean;
  /** Present only on the pooled "85+" row - Census's source stops at an
   * open-ended "85 years and over" with no reported width to divide by,
   * so unlike 80-84 it's kept as one pooled row rather than split.
   * ageMin/ageMax give it a plot width so it can be rendered as a band;
   * this is a display approximation only (see generate_voter_age_data.py's
   * OLD_AGE_* constants) - no arithmetic depends on it. */
  ageMin?: number;
  ageMax?: number;
  cvap: number; // citizen voting-age population, thousands
  voted: number; // thousands
  shareElig: number; // % of national CVAP total
  shareVote: number; // % of national votes-cast total
  turnout: number; // % of this age's CVAP that voted
}

export type AgeBin = "18-24" | "25-34" | "35-44" | "45-64" | "65+";

export interface BinStats {
  cvap: number;
  voted: number;
  moeVoted: number | null; // null = Census suppressed (sample too small), not zero
  shareElig: number;
  shareVote: number;
  turnout: number;
}

export interface NationalCycle {
  year: number;
  isPresidential: boolean;
  bins: Record<AgeBin, BinStats>;
  under35Gap: number; // shareVote(18-34) - shareElig(18-34), percentage points
  under35Turnout: number;
  over65Turnout: number;
}

export type MailStatus =
  | "permanent-pre2016"
  | "permanent-post2020"
  | "covid-only"
  | "never";

export interface StateYearData {
  bins: Record<AgeBin, { cvap: number; voted: number; moeVoted: number | null }>;
  under35Gap: number;
}

export interface StateRow {
  state: string; // uppercase, e.g. "OKLAHOMA"
  abbr: string;
  years: Record<string, StateYearData>; // keys "2016" | "2020" | "2024"
  under35GapPooled: number | null;
  under35Gap2024: number | null;
  moeVoted1824_2024: number | null;
  mailStatus: MailStatus;
}

// Statistical claims too involved to re-derive client-side (a Welch t-test,
// an OLS mean-reversion check, a placebo comparison) are computed once in
// the pipeline and shipped as build-time constants - see
// scripts/generate_voter_age_data.py and .claude/voter-age-spec.md S8/S9.
export interface DerivedStats {
  mailCrossSection2024: {
    mailMean: number;
    neverMean: number;
    nMail: number;
    nNever: number;
    welchT: number;
    welchDf: number;
    significant: boolean;
  };
  meanReversionNeverMail: {
    intercept: number;
    slope: number;
    r: number;
    predictedImprovementAtAdopterStartingLevel: number;
  };
  placeboAlwaysMailPre2016: {
    statesChecked: string[];
    meanChange2016to2024: number;
    neverMailMeanChange2016to2024: number;
  };
  naturalExperiment: {
    neverMailMeanByYear: Record<string, number>;
    newJersey: {
      gapByYear: Record<string, number>;
      didOnSwitch2020: number;
      didOffSwitch2024: number;
    };
    montana: {
      gapByYear: Record<string, number>;
      didOnSwitch2020: number;
      didOffSwitch2024: number;
    };
  };
}

export interface VoterAgeData {
  derived: DerivedStats;
  meta: {
    source: string;
    sourceUrls: string[];
    retrieved: string;
    units: string;
    notes: string[];
  };
  /** Keyed by election year as a string, e.g. "2024". Covers every cycle
   * Table 1 (single year of age) is available for: 2016/2020/2022/2024
   * - not 2018 (mislabeled at the source, see the pipeline script). */
  nationalByYearOfAge: Record<string, SingleYearRow[]>;
  nationalByBin: NationalCycle[];
  states: StateRow[];
}
