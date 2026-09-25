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
  bench: string; // this cycle's 65+ rate, fmtPct'd - "the dotted line" (step 2, always 2024's)
  bench2022: string;
  crossoverAge: number | null;
  shortfall2024: string;
  under35Missing: string;
  shortfall2024Pct: string;
  reg65: string; // 2024 65+ registration rate
  reg65_2022: string;
  youthReg: string; // 2024 18-24 registration rate
  youthShowUp: string; // 2024 share of registered 18-24s who voted
  youthShowUp2022: string;
  regGap2024: string; // people short of the 65+ registration rate
  notVoted2024: string; // registered people who didn't vote, all ages
  regGap2022: string;
  notVoted2022: string;
  /** Step 9's turnout-by-age table, rendered by AgeBeats.tsx (it's data
   * presentation, not prose) and embedded here so the surrounding paragraphs
   * stay in one place with it. */
  compareTable: ReactNode;
}

export const ageBeatsTitle = "1. The age of the electorate";
export const midtermsTitle = "2. Midterms make it worse";

export const ageBeatsSteps: StepCopy<AgeBeatsVals>[] = [
  {
    heading: "The country skews younger",
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
    heading: "Voters skew older",
    body: () => (
      <p>
        A distinctly different shape appears among voters because older people tend to vote more than younger people.
      </p>
    ),
  },
  {
    heading: "People 65-and-over vote the most",
    body: (v) => (
      <>
        <p>
          The highest participation rate ({v.bench}) belongs to those 65-and-over, perhaps because most are retired
          and have more time. The dotted line is how many votes every age would cast at that rate. If everyone voted
          like the 65+ crowd there would be <strong>{v.shortfall2024} more votes</strong>, representing{" "}
          <strong>{v.shortfall2024Pct}</strong> of the population.
        </p>
        <div className="voa-callout">
          In elections where the margins of victory tends to be small, this can be significant.
        </div>
      </>
    ),
  },
  {
    heading: "First, you have to register",
    body: () => (
      <p>
        Part of the gap opens before election day. The paler green is everyone who{" "}
        <Gloss
          note={
            <>
              Registration is self-reported in the same survey as voting. Census counts people who didn't answer the
              question as not registered, and young people skip it most often (about one in five 18-to-24-year-olds),
              so their registration is probably somewhat understated.
            </>
          }
        >
          says they're registered
        </Gloss>
        ; the part showing above each votes bar is registered people who didn't vote. Like voting, registering
        climbs with age.
      </p>
    ),
  },
  {
    heading: "The registration gap",
    body: (v) => (
      <p>
        {v.reg65} of people 65-and-over are registered, compared with {v.youthReg} of 18-to-24-year-olds. The dotted
        line is how many would be registered at every age if everyone matched the 65+ rate. The gold between that
        line and the paler bars is people who aren't on the rolls: <strong>{v.regGap2024}</strong>. Add the{" "}
        {v.notVoted2024} registered people who didn't vote, and those are the two hurdles.
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
          The dotted line still traces the 65-and-over registration rate, which barely slips in a midterm ({v.reg65}{" "}
          to {v.reg65_2022}). The gold, people not registered, grows from {v.regGap2024} to {v.regGap2022}.
        </p>
        <p>
          The bigger change is the paler green: registered people who didn't vote. It doubles, from{" "}
          {v.notVoted2024} to <strong>{v.notVoted2022}</strong>.
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
// Explorer (Explorer.tsx, YearControl.tsx) - every November election on record
// ---------------------------------------------------------------------------

export interface ExplorerVals {
  firstYear: string; // earliest cycle in byAge
}

export const explorerCopy = {
  title: (v: ExplorerVals) => `3. Every election since ${v.firstYear}`,
  intro: (v: ExplorerVals) => (
    <>
      <p>
        This is the same chart, for every November election since {v.firstYear}. Pick a year; midterms are marked
        with a dashed outline. Each bar stays at its age, so switching years compares the same ages across
        elections, not the same people.
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
  heroNotRegistered: "not registered",
  heroNotVoted: "registered, didn't vote",
};
