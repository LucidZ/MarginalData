import { useJsonData } from "../../hooks/useJsonData";
import LoadingSpinner from "../../components/LoadingSpinner";
import Beat1 from "./Beat1";
import Beat2 from "./Beat2";
import Beat3 from "./Beat3";
import Beat4 from "./Beat4";
import type { VoterAgeData } from "./types";
import "./App.css";

export default function App() {
  const { data, error } = useJsonData<VoterAgeData>("/data/voter-age.json");

  if (error) {
    return (
      <div className="voa-root">
        <p>Couldn't load the data for this story: {error.message}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="voa-root">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="voa-root">
      <header className="voa-header">
        <h1>The Electorate Is Older Than the Country</h1>
        <p className="voa-intro">
          Voting is one person, one vote — but turnout isn't age-neutral, so the electorate that
          actually shows up skews older than the population that's eligible to vote. Using five
          election cycles of Census Bureau survey data, here's how large that gap is, where it
          shows up, and whether the policy usually proposed to close it — mail-in voting —
          actually does.
        </p>
      </header>

      <Beat1 data={data} />
      <Beat2 data={data} />
      <Beat3 data={data} />
      <Beat4 data={data} />

      <footer className="voa-sources">
        <strong>Source:</strong> {data.meta.source}, 2016/2018/2020/2022/2024 cycles.{" "}
        <a href="https://www.census.gov/topics/public-sector/voting.html" target="_blank" rel="noopener noreferrer">
          [Census methodology]
        </a>
        . Eligible population = citizen voting-age population, not total voting-age population.
        CPS turnout is self-reported and runs higher than certified results (the 2024 U.S. total
        here is 65.3% vs. an actual ~63.9% VEP turnout) — this affects levels more than the
        shares and gaps this story is built on, but overreporting isn't perfectly uniform across
        age groups, so treat exact percentage points as approximate.{" "}
        <a
          href="https://www.electproject.org/election-data/cps-vote-over-report-and-non-response-bias-correction"
          target="_blank"
          rel="noopener noreferrer"
        >
          [More on CPS overreporting]
        </a>
        <br />
        Mail-in voting classification (all-mail states, adoption dates, and the 2020
        COVID-era reversions) from Ballotpedia and the MIT Election Lab, verified 2026-09-03.
        <br />
        Retrieved {data.meta.retrieved}. Full derivation, guardrails, and known data quirks
        (including a mislabeled 2018 Census file) documented in{" "}
        <code>.claude/voter-age-spec.md</code> and{" "}
        <code>scripts/generate_voter_age_data.py</code>.
      </footer>
    </div>
  );
}
