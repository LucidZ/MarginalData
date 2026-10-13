import type { ReactNode } from "react";
import { Gloss, GlossList } from "../../components/Footnotes";
import type { VoterAgeData } from "./types";

/**
 * Every hand-written sentence in the VoterAge story, in one file, so a copy
 * edit doesn't require hunting through the component files. Numbers still
 * come from the data via each `Vals` object the owning component builds -
 * per .claude/voter-age-spec-v2.md S9, no figure here is ever hand-typed.
 * What's NOT here: table markup, StickyViz panes, and any prose that's
 * itself pulled straight from the pipeline JSON (meta.construction etc.) -
 * those are edited at the data layer, not here.
 */

export interface StepCopy<V> {
  heading: ReactNode | ((v: V) => ReactNode);
  body: (v: V) => ReactNode;
}

// ---------------------------------------------------------------------------
// Header + footer (App.tsx)
// ---------------------------------------------------------------------------

export const hero = {
  title: "The Shape of the Electorate",
  intro: (
    <>
The U.S. was founded in part on the principle of representative democracy, 
yet for most of its early history, the right to vote was restricted to white 
male landowners. Over the past 250 years, marginalized groups—including women, 
Black Americans, and young people—have fought, protested, and pushed for legal 
reforms to secure equal voting rights and political representation.

Despite those historic struggles, voter participation remains surprisingly low, 
with only about 60% of eligible voters casting ballots in typical presidential 
elections. This page explores the shape of the electorate versus the 
broader population it is meant to represent.
    </>
  ),
};

// Closing call to action, straight after the story, before the explorer. Election day
// is hand-typed: update it (or drop the line) after November 3, 2026.
export const voteCta = {
  heading: "Make sure you're counted.",
  body: (
    <>
      The next election is the <strong>November 3, 2026 midterm</strong>, exactly the kind of election where
      turnout drops most. Registration deadlines vary by state, and some fall weeks before Election Day. Check your
      status now, then vote.
    </>
  ),
  button: "Check your registration at vote.gov",
  href: "https://vote.gov/",
  note: "Vote.gov is the official U.S. government site for registering and finding your state's election info.",
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
      Turnout records in the year cards (lowest or highest since a given year) are from the US Elections Project's
      national turnout series, 1789–present.{" "}
      <a href="https://www.electproject.org/national-1789-present" target="_blank" rel="noopener noreferrer">
        [US Elections Project]
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
// Beats 1 + 2 (AgeBeats.tsx) - one merged section, 6 steps
// ---------------------------------------------------------------------------

export interface AgeBeatsVals {
  age25cvap: string;
  age75cvap: string;
  bench: string; // this cycle's 65+ rate, fmtPct'd - "the dotted line" (steps 2-3, always 2024's)
  bench2022: string;
  crossoverAge: number | null;
  shortfall2024: string;
  under35Missing: string;
  shortfall2024Pct: string;
  shortfall2022: string; // against 2022's own 65+ rate
  shortfall2022Pct: string;
}

export const ageBeatsTitle = "1. Voters Skew Older";
export const midtermsTitle = "2. Midterm Voters Skew Even Older";

export const ageBeatsSteps: StepCopy<AgeBeatsVals>[] = [
  {
    heading: "The country skews younger.",
    body: () => (
      <p>
        Each bar is how many citizens of that age were{" "}
        <Gloss
          note={
            <>
              Eligible means citizens 18 and older. That leaves out:
              <GlossList
                items={[
                  "Non-citizens",
                  "Citizens younger than 18",
                  "People with felony convictions (varies by state)",
                  "Residents of U.S. territories",
                  "People declared mentally incapacitated (varies by state)",
                ]}
              />
            </>
          }
        >
          eligible
        </Gloss>{" "}
        to vote in 2024.
      </p>
    ),
  },
  {
    heading: "But, voters skew older...",
    body: () => (
      <p>
      </p>
    ),
  },
  {
    heading: "with people 65-and-over voting the most.",
    body: (v) => (
      <p>
        The highest participation rate ({v.bench}) belongs to those 65-and-over, perhaps because most are retired and
        have more time.
      </p>
    ),
  },
  {
    heading: (v) => (
      <>
        This shortfall is <span className="voa-gap-text">{v.shortfall2024Pct}</span> of votes cast.
      </>
    ),
    body: () => (
      <>
        <p>
          In elections where the margins of victory tends to be small, this can be significant.
        </p>
      </>
    ),
  },
  {
    heading: (v) => (
      <>
        In 2022, a midterm election, the shortfall was <span className="voa-gap-text">{v.shortfall2022Pct}</span> of votes cast.
      </>
    ),
    body: (v) => (
      <p>
        Turnout was lower across all ages, but the older skew of voters was even more pronounced. 
      </p>
    ),
  },
];

// ---------------------------------------------------------------------------
// Explorer - every election by age, after the story (Explorer.tsx, YearControl.tsx)
// ---------------------------------------------------------------------------

export interface ExplorerVals {
  firstYear: string; // earliest cycle in byAge
}

/** The non-age views' caveat, filled from the year being shown. */
export interface DimensionVals {
  year: string;
  benchmark: string; // the highest-turnout group's full label
  totalGap: string; // e.g. "2.4%" - how far the survey total runs under the age view's
  imputed?: string; // income only, e.g. "20.5%"
}

export const explorerCopy = {
  title: "Explore every election",
  intro: (v: ExplorerVals) => (
    <p>
      The same chart for every election since {v.firstYear}. Pick a year: the bars follow each generation, sliding
      two years younger for every election back. Or slice the same electorate another way: by education, family
      income or race.
    </p>
  ),
  dimsLabel: "Slice by",
  dims: {
    age: "Age",
    education: "Education",
    income: "Family income",
    race: "Race / ethnicity",
  },
  /** The dotted line's legend in a non-age view. */
  benchmarkLine: (group: string, pct: string) => `at ${group} turnout (${pct})`,
  dimCaveat: (v: DimensionVals) => (
    <>
      Education, income and race come straight from the Census survey's own counts. The survey covers people living
      in households, so its total runs {v.totalGap} under the age view, which also counts people in nursing homes,
      prisons and the military. Here the dotted line is the best-voting group's rate (
      {v.benchmark.toLowerCase()}), not the 65+ rate.
    </>
  ),
  incomeCaveat: (v: DimensionVals) => (
    <>
      {" "}
      Family income is the household's combined family income (your own, if you live alone or with roommates), in{" "}
      {v.year} dollars, not adjusted for inflation. Census estimated it for the {v.imputed} who didn't report it.
    </>
  ),
  caveat: (v: ExplorerVals) => (
    <>
      Population for {v.firstYear}–2018 comes from the Census Bureau's 2010–2020 intercensal estimates, which were
      revised after the 2020 census counted everyone. Later years use its current estimates, anchored to the same
      census.
    </>
  ),
  controlLabel: "Election year",
  presidential: "Presidential",
  midterm: "Midterm",
  // The VCR badge on the chart (RewindOverlay.tsx), by direction.
  rewinding: "rew",
  fastForwarding: "ff",
};

export const summaryTitle = "3. It's not just 2022";

// ---------------------------------------------------------------------------
// Section 3 (AgeBeats.tsx): the scroll rewinds 2022 -> first year in the gold
// view, one year card per election, then sums it up. Placeholder copy.
// ---------------------------------------------------------------------------

export interface RewindVals {
  firstYear: string;
}

export const rewindCopy = {
  heading: (v: RewindVals) => <>This pattern isn't new</>,
  body: () => (
    <p>
      You can see this same pattern going back to at least 2012.
    </p>
  ),
};

/** A year card's one figure: the number big, a short label beside it. */
const CardFigure = ({ value, tone, label }: { value: string; tone: "gap" | "votes"; label: string }) => (
  <p className="voa-year-card__figure">
    <strong className={`voa-${tone}-text`}>{value}</strong> {label}
  </p>
);

export interface RewindCardVals {
  shortfallPct: string;
}

/** Only the elections whose bar would otherwise prompt a "why?" get a note
 * on its card.
 * Records are from the US Elections Project's national turnout series
 * (eligible-population turnout, 1789-present): 2014 midterm 36.7%, lowest
 * since 1942's 33.9%; 2018 midterm 50.0%, highest since 1914's 50.4%; 2020
 * presidential 66.6%, highest since 1900's 73.7%. Its rates differ from the
 * CPS ones on the chart, so the notes quote the record, not the rate. */
const turnoutNotes: Record<string, string> = {
  "2014": "Lowest midterm turnout since 1942",
  "2018": "Highest midterm turnout since 1914",
  "2020": "Highest presidential turnout since 1900",
};

const TurnoutNote = ({ year }: { year: string }) =>
  turnoutNotes[year] ? <p className="voa-year-card__note">{turnoutNotes[year]}</p> : null;

export const rewindCardCopy = (year: string, v: RewindCardVals) => (
  <>
    <CardFigure value={v.shortfallPct} tone="gap" label="shortfall, as a share of votes cast" />
    <TurnoutNote year={year} />
  </>
);

export interface GoldSummaryVals {
  midterms: string; // shortfall range in midterms, e.g. "30.8M–40.3M"
  presidentials: string;
  midtermPcts: string; // the same as % of votes cast, e.g. "24.7%–42.9%"
  presidentialPcts: string;
}

// Placeholder copy - the gold-view summary at the end of the rewind.
export const goldSummaryCopy = {
  mergeHeading: "All of it, in one bar",
  merge: (v: { year: string }) => (
    <p>
      [Placeholder] Stack every age from {v.year} into a single bar: the people who voted, then the gold shortfall
      on top of them.
    </p>
  ),
  revealHeading: "More gold in every midterm",
  reveal: (v: GoldSummaryVals) => (
    <p>
      [Placeholder] The gold grows in every midterm: <span className="voa-gap-text">{v.midterms}</span> votes short,
      against <span className="voa-gap-text">{v.presidentials}</span> in presidential years.
    </p>
  ),
  pctHeading: "As a share of votes cast",
  pct: (v: GoldSummaryVals) => (
    <p>
      [Placeholder] Measured against the votes actually cast, midterms fall{" "}
      <span className="voa-gap-text">{v.midtermPcts}</span> short, presidential years{" "}
      <span className="voa-gap-text">{v.presidentialPcts}</span>.
    </p>
  ),
  pctYLabel: "Shortfall (% of votes cast)",
  xLabel: "Election",
};
