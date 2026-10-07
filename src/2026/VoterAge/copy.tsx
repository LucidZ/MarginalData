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
  heading: string | ((v: V) => string);
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
// Beats 1 + 2 (AgeBeats.tsx) - one merged section, 9 steps
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
  reg65: string; // 2024 65+ registration rate
  youthReg: string; // 2024 18-24 registration rate
  youthShowUp: string; // 2024 share of registered 18-24s who voted
  youthShowUp2022: string;
  showUp65: string; // 2024 share of registered 65+ who voted
  // Plain head-counts, all ages: registered people who didn't vote, and
  // eligible citizens who aren't registered.
  regNotVoted2024: string;
  regNotVoted2022: string;
  notRegistered2024: string;
  notRegistered2022: string;
  /** The last beat step's turnout-by-age table, rendered by AgeBeats.tsx (it's data
   * presentation, not prose) and embedded here so the surrounding paragraphs
   * stay in one place with it. */
  compareTable: ReactNode;
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
    heading: (v) => `This shortfall is ${v.shortfall2024Pct} of votes cast.`,
    body: () => (
      <>
        <p>
          In elections where the margins of victory tends to be small, this can be significant.
        </p>
      </>
    ),
  },
  {
    heading: "Some people are registered but don't vote...",
    body: (v) => (
      <p>
        Some people are{" "}
        <Gloss
          note={
            <>
              Registration is self-reported in the same survey as voting. Census counts people who didn't answer the
              question as not registered, and young people skip it most often (about one in five 18-to-24-year-olds),
              so their registration is probably somewhat understated.
            </>
          }
        >
          registered
        </Gloss>{" "}
        but don't vote. The pale band above each green bar is them: <strong>{v.regNotVoted2024}</strong> people in
        2024. Of registered people 65-and-over, {v.showUp65} voted; of registered 18-to-24-year-olds,{" "}
        {v.youthShowUp}.
      </p>
    ),
  },
  {
    heading: "and many more aren't registered at all",
    body: (v) => (
      <p>
        The grey above the pale band is eligible citizens who aren't registered: <strong>{v.notRegistered2024}</strong>{" "}
        people. {v.reg65} of people 65-and-over are registered, compared with {v.youthReg} of 18-to-24-year-olds.
      </p>
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
    heading: "2022: registered, but staying home",
    body: (v) => (
      <>
        <p>
          Every bar slid two years left as it fell — it's the same people, two years younger. The two youngest slid
          clean off the chart: 2024's 18- and 19-year-olds weren't old enough to vote in 2022 at all.
        </p>
        <p>
          The dotted line still traces the 65-and-over turnout rate, which drops in a midterm too ({v.bench} to{" "}
          {v.bench2022}). The number not registered grows a little: {v.notRegistered2024} to{" "}
          {v.notRegistered2022}.
        </p>
        <p>
          The big change is the pale band: registered people staying home. It doubles, from {v.regNotVoted2024} to{" "}
          <strong>{v.regNotVoted2022}</strong>.
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
        <p>
          Fewer young people say they're registered in a midterm too, but the steeper drop is among those who are.
          Of registered 18-to-24-year-olds, {v.youthShowUp} voted in 2024; in 2022 only {v.youthShowUp2022} did.
        </p>
      </>
    ),
  },
];

// ---------------------------------------------------------------------------
// Section 3 - every election, back to 2012 (AgeBeats.tsx steps 8+, YearControl.tsx)
// ---------------------------------------------------------------------------

export interface ExplorerVals {
  firstYear: string; // earliest cycle in byAge
}

export interface YearCardVals {
  year: string;
  kind: "presidential" | "midterm";
  turnout: string; // fmtPct(avgTurnout)
}

export const explorerCopy = {
  title: (v: ExplorerVals) => `3. Every election since ${v.firstYear}`,
  intro: (v: ExplorerVals) => (
    <>
      <p>
        Keep scrolling to go back one election at a time, to {v.firstYear}. The bars keep following each generation:
        every step back, they slide two years younger. Scroll up to come forward again, or pick a year above the
        chart.
      </p>
      <p className="voa-explorer-caveat">
        Population for {v.firstYear}–2018 comes from the Census Bureau's 2010–2020 intercensal estimates, which
        were revised after the 2020 census counted everyone. Later years use its current estimates, anchored to the
        same census.
      </p>
    </>
  ),
  controlLabel: "Election year",
  presidential: "Presidential",
  midterm: "Midterm",
  yearCard: (v: YearCardVals) => <>{v.turnout} of eligible citizens voted.</>,
  rewinding: "rewinding",
  fastForwarding: "fast-forwarding",
};

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
