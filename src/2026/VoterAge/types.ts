// Mirrors public/data/voter-age.json, produced by
// scripts/generate_voter_age_data.py. See .claude/voter-age-spec.md for the
// full derivation and the integrity guardrails these fields exist to serve.

export interface SingleYearRow {
  age: number; // 82 = "80-84" bucket midpoint, 87 = "85+" bucket midpoint
  ageLabel: string;
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
  nationalByYearOfAge: SingleYearRow[];
  nationalByBin: NationalCycle[];
  states: StateRow[];
}
