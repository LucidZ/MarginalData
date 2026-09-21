import type { ReactNode } from "react";
import type { VoterAgeData } from "./types";

/**
 * Every hand-written sentence in the VoterAge story, in one file, so a copy
 * edit doesn't require hunting through four component files. Numbers still
 * come from the data via each `Vals` object the owning component builds -
 * per .claude/voter-age-spec-v2.md S9, no figure here is ever hand-typed.
 * What's NOT here: table markup, StickyViz panes, and any prose that's
 * itself pulled straight from the pipeline JSON (co.confounds, income.note,
 * co.age.shapeNote, etc.) - those are edited at the data layer, not here.
 */

export interface StepCopy<V> {
  heading: string;
  body: (v: V) => ReactNode;
}

// ---------------------------------------------------------------------------
// Header + footer (App.tsx)
// ---------------------------------------------------------------------------

export const hero = {
  title: "The Shape of the Electorate",
  intro: (
    <>
      Voting is one person, one vote — but turnout isn't uniform, so the electorate that actually shows up isn't a
      scale model of the country. Using Census Bureau survey data and real population counts, here's who's missing,
      when it's worst, which traits it shows up on besides age, and the one place a policy change has been shown to
      narrow it.
    </>
  ),
};

export function loadErrorText(message: string): ReactNode {
  return <>Couldn't load the data for this story: {message}</>;
}

export function sourcesFootnote(meta: VoterAgeData["meta"]): ReactNode {
  return (
    <>
      Eligible population = citizen voting-age population, not total voting-age population, so the gaps here aren't
      confounded with non-citizen population share.{" "}
      <a href="https://www.census.gov/topics/public-sector/voting.html" target="_blank" rel="noopener noreferrer">
        [Census methodology]
      </a>
      . CPS turnout is self-reported and runs higher than certified results — this affects levels more than the gaps
      this story is built on, but overreporting isn't perfectly uniform across groups, so treat exact percentage
      points as approximate.{" "}
      <a
        href="https://www.electproject.org/election-data/cps-vote-over-report-and-non-response-bias-correction"
        target="_blank"
        rel="noopener noreferrer"
      >
        [More on CPS overreporting]
      </a>
      <br />
      Population by single year of age is from the Census Population Estimates Program (PEP), combined with CPS
      turnout and citizen-share rates — see {meta.construction}
      <br />
      Retrieved {meta.retrieved}. Full derivation, guardrails and known data quirks documented in{" "}
      <code>.claude/voter-age-spec-v2.md</code> and <code>scripts/generate_voter_age_data.py</code>.
    </>
  );
}

// ---------------------------------------------------------------------------
// Beats 1 + 2 (AgeBeats.tsx) - one merged section, 9 steps
// ---------------------------------------------------------------------------

export interface AgeBeatsVals {
  age25cvap: string;
  age75cvap: string;
  bench: string; // this cycle's 65+ rate, fmtPct'd - "the dotted line" (step 2, always 2024's)
  bench2022: string;
  crossoverAge: number | null;
  shortfall2024: string;
  under35Missing: string;
  shortfall2024Pct: string;
  declineAge: number | null;
  missing80Plus: string;
  /** Step 8's turnout-by-age table, rendered by AgeBeats.tsx (it's data
   * presentation, not prose) and embedded here so the surrounding paragraphs
   * stay in one place with it. */
  compareTable: ReactNode;
}

export const ageBeatsTitle = "1. The shape of the electorate";
export const midtermsTitle = "2. Midterms make it worse";

export const ageBeatsSteps: StepCopy<AgeBeatsVals>[] = [
  {
    heading: "Every bar is one year of age",
    body: (v) => (
      <p>
        The light bar is how many citizens of that age were eligible to vote in 2024. There are more 25-year-olds (
        {v.age25cvap} eligible) than 75-year-olds ({v.age75cvap}) — the population just gets thinner with age, the
        way it does in most rich countries.
      </p>
    ),
  },
  {
    heading: "Now add who actually voted",
    body: () => (
      <p>
        The solid bar is votes cast. It's shorter than the light bar everywhere — turnout is never 100% — but not by
        the same amount at every age. Watch how much of the light bar the solid one covers as you move left to right.
      </p>
    ),
  },
  {
    heading: "The dotted line is what 65-and-over does",
    body: (v) => (
      <p>
        It traces what each age's vote bar would reach if every age turned out the way people 65 and older actually
        do: {v.bench}. That's the most reliable bloc in the electorate — the one group whose turnout barely moves
        from one election to the next — so it's a steadier yardstick than a national average that blends every age
        together.
      </p>
    ),
  },
  {
    heading: "Fill in what's missing",
    body: (v) => (
      <p>
        Gold is the distance from a bar up to that line: votes an age would have cast at the 65+ rate, and didn't.
        The gold runs out around age {v.crossoverAge} — not a hard cutoff, a few ages just below it already clear the
        line before it holds for good, but that's roughly where turnout catches up to the 65+ standard.
      </p>
    ),
  },
  {
    heading: "In votes, not percentages",
    body: (v) => (
      <>
        <p>
          Add the gold up and it comes to <strong>{v.shortfall2024} votes</strong> — ballots that would exist if
          every age turned out the way 65-and-overs do. Most of it is concentrated young: under-35s account for{" "}
          <strong>{v.under35Missing}</strong> of the total on their own.
        </p>
        <div className="voa-callout">
          {v.shortfall2024} missing votes, {v.shortfall2024Pct} of every ballot cast in 2024 — and{" "}
          <strong>{v.under35Missing}</strong> of it is under 35.
        </div>
      </>
    ),
  },
  {
    heading: "Even 65+'s own standard doesn't hold forever",
    body: (v) => (
      <>
        <p>
          Watch the far right edge: by around age {v.declineAge}, the gold comes back. Turnout keeps declining into
          the 80s and 90s — even the age group that sets this bar eventually falls short of it. The 65+ line isn't a
          ceiling everyone past 65 clears; it's a bloc average with its own decline built in at the far end.
        </p>
        <div className="voa-callout">
          <strong>{v.missing80Plus}</strong> of the shortfall is ages 80 and up — a small slice of a small
          population, but a real reversal of the pattern the rest of the chart shows.
        </div>
      </>
    ),
  },
  {
    heading: "No president on the ballot",
    body: () => (
      <p>
        Nothing has moved: same bars, same 2024 election, same line. Now rewind two years and take the president off
        the ballot. In a midterm, turnout drops for everyone. The question is whether it drops evenly.
      </p>
    ),
  },
  {
    heading: "2022: even the standard slips",
    body: (v) => (
      <>
        <p>
          Every bar slid two years left as it fell — it's the same people, two years younger. The two youngest slid
          clean off the chart: 2024's 18- and 19-year-olds weren't old enough to vote in 2022 at all.
        </p>
        <p>
          Watch the dotted line, not just the bars — it isn't fixed. It traces what 65-and-overs manage in each
          election on its own terms, the same way it did a moment ago: {v.bench} in 2024, down to {v.bench2022} in a
          midterm. Even the most reliable voters in the country turn out less without a president on the ballot — but
          only by eight points.
        </p>
        <p>
          What doesn't slip by eight points is everyone else. Watch how much further the bars themselves fall against
          that lower line.
        </p>
      </>
    ),
  },
  {
    heading: "The young nearly stop showing up; the old barely notice",
    body: (v) => (
      <>
        <p>Turnout by single year of age, presidential vs. midterm:</p>
        {v.compareTable}
        <p>
          An 18-year-old's turnout is nearly cut in half. A 79-year-old's barely moves. Older voters show up
          regardless of what's on the ballot; younger voters mostly show up for president.
        </p>
      </>
    ),
  },
];

// ---------------------------------------------------------------------------
// Beat 3 - "isn't only about age" (Beat3.tsx), 4 steps
// ---------------------------------------------------------------------------

export interface Beat3Vals {
  eduLowTurnout: string;
  eduHighTurnout: string;
  hsOrLessMissing: string; // fmtM(Math.abs(...))
  hsOrLessMissingSigned: string; // fmtMSigned(...)
  hispanicMissing: string;
  incomeLowTurnout: string;
  incomeHighTurnout: string;
  under50kMissing: string;
}

export const beat3Title = "3. It isn't only about age";

export const beat3Steps: StepCopy<Beat3Vals>[] = [
  {
    heading: "Age, education, income and race are all tangled together",
    body: () => (
      <p>
        This is a descriptive story, not a causal one — these four traits correlate heavily with each other, so none
        of what follows isolates "the effect" of any one of them. The point is narrower: age isn't the only axis
        where the electorate doesn't look like the country.
      </p>
    ),
  },
  {
    heading: "Education is the biggest gap in the data",
    body: (v) => (
      <>
        <p>
          Turnout ranges from {v.eduLowTurnout} (less than 9th grade) to {v.eduHighTurnout} (advanced degree) — a
          wider spread than age. High school or less accounts for nearly all of the gold here:{" "}
          <strong>{v.hsOrLessMissing} missing votes</strong> across three groups.
        </p>
        <div className="voa-callout">
          Largest single gap in this story: <strong>{v.hsOrLessMissingSigned}</strong> for high school or less.
        </div>
      </>
    ),
  },
  {
    heading: "Race and ethnicity",
    body: (v) => (
      <p>
        Hispanic voters fall <strong>{v.hispanicMissing}</strong> short of the line — the largest single gap on this
        chart. Black and Asian voters are short too, by smaller amounts, because those are smaller populations.
        White, non-Hispanic voters are the one group above it.
      </p>
    ),
  },
  {
    heading: "Income shows the same pattern, and comes with a caveat",
    body: (v) => (
      <p>
        Family income runs a clean gradient from {v.incomeLowTurnout} to {v.incomeHighTurnout}. Households under $50k
        cast <strong>{v.under50kMissing} fewer</strong> votes than proportional.
      </p>
    ),
  },
];

// ---------------------------------------------------------------------------
// Beat 4 - "Does anything change this?" (Beat4.tsx), 5 steps
// ---------------------------------------------------------------------------

export interface Beat4Vals {
  overallEffectPp: string; // co.overall.effectPp.toFixed(1)
  bonicaUrl: string;
}

export const beat4Title = "4. Does anything change this?";

/** Prose in the sticky pane itself, not a scrolly step. */
export const beat4Sticky = {
  dotLegend: (overallEffectPp: string) => (
    <>Dashed line: overall effect (+{overallEffectPp}pp). Each dot is that group's own effect ± 1 standard error.</>
  ),
  ageCardBody: (relativeIncreasePct: number, youngestCohortLabel: string) => (
    <>
      for the youngest cohorts ({youngestCohortLabel}) — a {relativeIncreasePct}% relative increase over their 2010
      turnout. The largest effect of any group in the study.
    </>
  ),
  confoundsLabel: "Three caveats:",
};

export const beat4Steps: StepCopy<Beat4Vals>[] = [
  {
    heading: "Colorado moved to all-mail voting in 2014",
    body: (v) => (
      <p>
        Every registered voter gets a ballot mailed to them automatically. A study tracking individual voters by
        birth year and prior turnout found turnout rose about {v.overallEffectPp} points overall — and the gains
        weren't even.{" "}
        <a href={v.bonicaUrl} target="_blank" rel="noopener noreferrer">
          Bonica, Grumbach, Hill &amp; Jefferson (2021)
        </a>
        .
      </p>
    ),
  },
  {
    heading: "The rhyme: race",
    body: () => (
      <p>
        Every group gained more than the least-affected group. Asian, Black and Latino voters — all underrepresented
        in the national data you just saw — gained more than white voters did.
      </p>
    ),
  },
  {
    heading: "And income",
    body: () => (
      <p>
        Same shape. The lowest income bracket gained the most; the highest gained the least. It's not that all-mail
        voting is a uniform +8 points everywhere — it's larger exactly where the gap was larger.
      </p>
    ),
  },
  {
    heading: "Age shows the same pattern, biggest of all",
    body: () => (
      <p>
        The youngest voters — the group furthest below the line in beat one — gained the most from switching to
        all-mail ballots.
      </p>
    ),
  },
  {
    heading: "What this doesn't prove",
    body: () => (
      <p>
        This is one state, well-identified — not a randomized nationwide experiment. Read the pattern as{" "}
        <em>consistent with</em> all-mail voting closing representation gaps, not as proof it would do the same
        everywhere.
      </p>
    ),
  },
];
