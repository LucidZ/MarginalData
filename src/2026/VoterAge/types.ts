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
  /** The gold wedge (expected - votes, where positive) splits exactly into
   * these two, in thousands of votes relative to the 65+ standard. Both 0
   * where the age is at or above the line. */
  regShort: number; // votes lost to people below the 65+ registration rate (x the 65+ show-up rate)
  turnShort: number; // votes lost because registrants show up less often than 65+ registrants
  /** True for ages 80+ - Census's source only reports a turnout/citizen-
   * share rate pooled across the whole 80-84 or 85+ bucket, so these rows
   * share their rate with their bucket-mates even though the population
   * figure itself is a real single-year PEP estimate. */
  ratesPooled: boolean;
}

export interface AgeCycle {
  kind: "presidential" | "midterm"; // from the pipeline (year % 4) - don't recompute client-side
  avgTurnout: number; // percent - true national average; kept for CPS reconciliation, not the chart's benchmark
  over65Turnout: number; // percent - votes/cvap for ages 65+ only. The chart's benchmark line.
  over65Registration: number; // percent - registered/cvap for ages 65+
  over65ShowUp: number; // percent - over65Turnout / over65Registration, votes per 65+ registrant
  /** Thousands of votes: sums of regShort and turnShort. Together they
   * equal the voter shortfall (the gold wedge's total). */
  registrationShortfall: number;
  turnoutShortfall: number;
  /** Reference only, not drawn. Thousands of people short of the 65+
   * registration rate (head-count, not votes). */
  registrationGap: number;
  /** Reference only, not drawn. Thousands of registered people who didn't
   * vote, all ages. Not the other half of registrationGap - never sum. */
  registeredNotVoted: number;
  totalCvap: number; // thousands
  totalVotes: number; // thousands
  crossoverAge: number | null; // first age (ascending) whose own turnout reaches over65Turnout
  declineAge: number | null; // last age (descending) whose own turnout still reaches over65Turnout
  rows: AgeRow[];
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
  /** Keyed by election year as a string, every November election 2012-2024.
   * Beats 1-2 read "2024" and "2022" by key; the explorer reads them all. */
  byAge: Record<string, AgeCycle>;
}
