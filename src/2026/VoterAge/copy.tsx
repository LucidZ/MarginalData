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

export const ageBeatsTitle = "1. The age of the electorate";
export const midtermsTitle = "2. Midterms make it worse";

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
        have more time. The dotted line is how many votes every age would cast at that rate.
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
    heading: "No president on the ballot",
    body: (v) => (
      <p>
        Now rewind two years to the 2022 midterm. Turnout drops for everyone, 65-and-over included, so the dotted
        line drops too ({v.bench} to {v.bench2022}). The question is whether everyone drops evenly.
      </p>
    ),
  },
  {
    heading: (v) => (
      <>
        In 2022, the shortfall was <span className="voa-gap-text">{v.shortfall2022Pct}</span> of votes cast.
      </>
    ),
    body: (v) => (
      <p>
        Every bar slid two years left as it fell: it's the same people, two years younger. Even measured against
        a lower 65-and-over rate, the shortfall grows from {v.shortfall2024} to <strong>{v.shortfall2022}</strong>.
        Older voters show up regardless of what's on the ballot; younger voters mostly show up for president.
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

export const explorerCopy = {
  title: "Explore every election",
  intro: (v: ExplorerVals) => (
    <p>
      The same chart for every election since {v.firstYear}. Pick a year: the bars follow each generation, sliding
      two years younger for every election back.
    </p>
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
  // Beat 2's rewind clock, by scroll direction.
  rewinding: "rewinding",
  fastForwarding: "fast-forwarding",
};

export const summaryTitle = "3. It's not just 2022";

// Placeholder copy - the summary chart after section 3's rewind.
export const summaryCopy = {
  mergeHeading: "Every age, added up",
  merge: (v: { year: string }) => (
    <p>
      [Placeholder] Drop the 65+ yardstick and just count. Stack every age from {v.year} into a single bar: the
      people who voted, then the people registered who didn't, then the eligible citizens who aren't registered
      at all.
    </p>
  ),
  revealHeading: "Every election, side by side",
  reveal: () => (
    <p>
      [Placeholder] Now every election from 2012 to 2024. The unregistered band barely moves. What swings is the
      pale band: registered people who sit out the midterms.
    </p>
  ),
  xLabel: "Election",
};

/** Averages over each presidential -> midterm pair (2012->14, 2016->18,
 * 2020->22), all from the data. */
export interface MidtermDropVals {
  pairs: number; // how many presidential -> midterm pairs are averaged
  eligiblePct: string; // signed, e.g. "+1.8%"
  registeredPct: string; // unsigned size of the drop, e.g. "4.8%"
  registeredM: string;
  votesPct: string;
  votesM: string;
  ratio: string; // votes drop / registration drop, in people, e.g. "4"
}

// Draft copy - three beats on the summary chart, one gold arrow layer each.
export const midtermDropSteps: StepCopy<MidtermDropVals>[] = [
  {
    heading: "The pool keeps growing",
    body: (v) => (
      <p>
        Between each presidential election and the midterm after it, the number of eligible citizens still grew,
        by <strong className="voa-gap-text">{v.eligiblePct}</strong> on average.
      </p>
    ),
  },
  {
    heading: "Registrations dip a little",
    body: (v) => (
      <p>
        In each of the last {v.pairs} midterms, fewer people said they were{" "}
        <Gloss
          note={
            <>
              Some of this dip is probably real, some probably isn't:
              <GlossList
                items={[
                  "People move, and a registration doesn't follow them to a new address",
                  "People change their names, and the registration has to be updated",
                  <>
                    The survey only asks about registration if someone says they didn't vote. People who vote are
                    assumed registered. In a midterm, far more people get asked, and some who are registered will
                    say they aren't, or don't know
                  </>,
                ]}
              />
            </>
          }
        >
          registered
        </Gloss>{" "}
        than two years before: down <strong className="voa-gap-text">{v.registeredPct}</strong> on average, about{" "}
        {v.registeredM} people.
      </p>
    ),
  },
  {
    heading: "Votes fall off a cliff",
    body: (v) => (
      <p>
        Votes fell <strong className="voa-gap-text">{v.votesPct}</strong> on average, about {v.votesM} people:
        roughly {v.ratio} times the drop in registrations. Most of the midterm drop isn't people falling off the
        rolls. It's registered voters who just don't show up.
      </p>
    ),
  },
];
