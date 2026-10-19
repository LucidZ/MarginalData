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
  // "More than a third" holds for every cycle in the data: non-voting runs 33.4% (2020) to 58.3% (2014).
  intro: (
    <>
      In a typical federal election, more than a third of eligible Americans don't vote. Here's who shows up, who
      doesn't, and how different the electorate looks from the country it represents.
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
      Retrieved {meta.retrieved}. Full derivation, guardrails and known data quirks are documented in the{" "}
      <a
        href="https://github.com/LucidZ/MarginalData/blob/main/scripts/generate_voter_age_data.py"
        target="_blank"
        rel="noopener noreferrer"
      >
        [data pipeline]
      </a>{" "}
      and{" "}
      <a
        href="https://github.com/LucidZ/MarginalData/blob/main/.claude/voter-age-spec-v2.md"
        target="_blank"
        rel="noopener noreferrer"
      >
        [spec]
      </a>
      .
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
    body: () => null,
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
          And while 100% turnout may be unrealistic, in close elections a gap this size can be decisive.
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
    body: () => (
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
  title: "Exploration Sandbox",
  intro: () => (
    <p>
      Eat your veggies and double check your registration first... but then feel free to explore other demographic
      characteristics and their associated shortfall. Age is just one way to look at voter representation data and
      it's not even the most skewed!
    </p>
  ),
  dimsLabel: "Slice by",
  dims: {
    age: "Age",
    education: "Education",
    income: "Family income",
    race: "Race / ethnicity",
  },
  measureLabel: "Show",
  measures: {
    people: "People",
    gap: "Shortfall only",
  },
  /** The shortfall-only view: each bar's gold, as a share of all votes cast,
   * named for the slice's benchmark group. */
  gapYLabel: (group: string) => `Shortfall vs. ${group} rate (% of all votes cast)`,
  gapLegendLabel: (group: string) => `Shortfall vs. ${group} rate`,
  /** Caption under the headline shortfall figure. */
  heroGapLabel: (group: string) => `shortfall vs. ${group} rate (% of all votes cast)`,
  gapLegend: "Shortfall, as a share of all votes cast",
  /** Tooltip line in the shortfall-only view. */
  gapTip: (short: string, pct: string) => `Shortfall: ${short} (${pct} of all votes cast)`,
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

// ---------------------------------------------------------------------------
// Section 3 (AgeBeats.tsx): the scroll rewinds 2022 -> first year in the gold
// view, one year card per election, then sums it up. Placeholder copy.
// ---------------------------------------------------------------------------

export interface RewindVals {
  firstYear: string;
}

export const rewindCopy = {
  heading: (_v: RewindVals) => <>This pattern isn't new</>,
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
    <CardFigure value={v.shortfallPct} tone="gap" label={explorerCopy.heroGapLabel("65+")} />
    <TurnoutNote year={year} />
  </>
);

export interface GoldSummaryVals {
  midtermPcts: string; // shortfall range in midterms as % of votes cast, e.g. "24.7%–42.9%"
  presidentialPcts: string;
}

// Placeholder copy - the gold-view summary at the end of the rewind.
export const goldSummaryCopy = {
  mergeHeading: "Let's group everything together to get a clearer picture...",
  merge: (_v: { year: string }) => (
    <p>
      The shortfall is still votes needed for each age group to match the 65+ voting rate.
    </p>
  ),
  pctHeading: "and then look at the shortfall as a share of votes cast",
  pct: (_v: GoldSummaryVals) => (
    <p>
      Shortfalls in midterm elections can be more than double the shortfalls seen in presidential elections.
    </p>
  ),
  /** The empty slot the summary opens at the end. */
  nextYear: "2026",
  nextHeading: "What will 2026 look like?",
  pctYLabel: "Shortfall vs. 65+ rate (% of all votes cast)",
  gapLegendLabel: "Shortfall vs. 65+ rate",
  xLabel: "Election",
};