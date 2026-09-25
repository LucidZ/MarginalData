// Mirrors public/data/voter-age.json, produced by
// scripts/generate_voter_age_data.py. See .claude/voter-age-spec-v2.md for
// the full derivation and integrity guardrails these fields exist to serve.

export interface AgeRow {
  age: number; // single year, 18-100 ("100" = "100 and over")
  cvap: number; // citizen voting-age population, thousands (PEP population x CPS citizen share)
  votes: number; // thousands (cvap x CPS turnout)
  expected: number; // cvap x this cycle's 65-and-over turnout, thousands
  missing: number; // votes - expected, thousands (negative = underrepresented)
  turnout: number; // percent
  registered: number; // thousands (cvap x CPS self-reported registration rate)
  registeredRate: number; // percent of cvap
  expectedRegistered: number; // cvap x this cycle's 65+ registration rate, thousands
  /** True for ages 80+ - Census's source only reports a turnout/citizen-
   * share rate pooled across the whole 80-84 or 85+ bucket, so these rows
   * share their rate with their bucket-mates even though the population
   * figure itself is a real single-year PEP estimate. */
  ratesPooled: boolean;
}

export interface AgeCycle {
  avgTurnout: number; // percent - true national average; kept for CPS reconciliation, not the chart's benchmark
  over65Turnout: number; // percent - votes/cvap for ages 65+ only. The chart's benchmark line.
  over65Registration: number; // percent - registered/cvap for ages 65+
  /** Thousands of people short of the 65+ registration rate (sum of
   * expectedRegistered - registered where positive). */
  registrationGap: number;
  /** Thousands of registered people who didn't vote, all ages (sum of
   * registered - votes). Not the other half of registrationGap - never sum. */
  registeredNotVoted: number;
  totalCvap: number; // thousands
  totalVotes: number; // thousands
  crossoverAge: number | null; // first age (ascending) whose own turnout reaches over65Turnout
  declineAge: number | null; // last age (descending) whose own turnout still reaches over65Turnout
  rows: AgeRow[];
}

export interface DimensionRow {
  group: string;
  cvap: number; // thousands
  votes: number; // thousands
  turnout: number; // percent
  expected: number; // thousands
  missing: number; // thousands
}

export interface Dimension {
  label: string;
  note?: string; // universe/coverage caveat, e.g. income's restricted-universe note
  avgTurnout: number; // percent - this dimension's own counterfactual rate
  rows: DimensionRow[];
}

export interface ColoradoSubgroupEffect {
  group: string;
  effectPp: number;
  sePp: number;
}

export interface ColoradoData {
  citation: string;
  url: string;
  license: string;
  overall: { effectPp: number; sePp: number };
  byDimension: {
    education: ColoradoSubgroupEffect[];
    income: ColoradoSubgroupEffect[];
    race: ColoradoSubgroupEffect[];
  };
  age: {
    youngestCohortEffectPp: number;
    youngestCohortLabel: string;
    relativeIncreasePct: number;
    shapeNote: string;
  };
  confounds: string[];
}

export interface VoterAgeData {
  meta: {
    sources: string[];
    sourceUrls: string[];
    retrieved: string;
    units: string;
    construction: string;
    notes: string[];
  };
  /** Keyed by election year as a string ("2022" | "2024"). */
  byAge: Record<string, AgeCycle>;
  byDimension: {
    education: Dimension;
    income: Dimension;
    race: Dimension;
  };
  colorado: ColoradoData;
}
