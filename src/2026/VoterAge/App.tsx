import { useJsonData } from "../../hooks/useJsonData";
import LoadingSpinner from "../../components/LoadingSpinner";
import AgeBeats from "./AgeBeats";
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
        <h1>The Shape of the Electorate</h1>
        <p className="voa-intro">
          Voting is one person, one vote — but turnout isn't uniform, so the electorate that actually shows up isn't
          a scale model of the country. Using Census Bureau survey data and real population counts, here's who's
          missing, when it's worst, which traits it shows up on besides age, and the one place a policy change has
          been shown to narrow it.
        </p>
      </header>

      <AgeBeats data={data} />
      <Beat3 data={data} />
      <Beat4 data={data} />

      <footer className="voa-sources">
        <strong>Sources:</strong>
        <ul className="voa-source-list">
          {data.meta.sources.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        Eligible population = citizen voting-age population, not total voting-age population, so the gaps here
        aren't confounded with non-citizen population share.{" "}
        <a href="https://www.census.gov/topics/public-sector/voting.html" target="_blank" rel="noopener noreferrer">
          [Census methodology]
        </a>
        . CPS turnout is self-reported and runs higher than certified results — this affects levels more than the
        gaps this story is built on, but overreporting isn't perfectly uniform across groups, so treat exact
        percentage points as approximate.{" "}
        <a
          href="https://www.electproject.org/election-data/cps-vote-over-report-and-non-response-bias-correction"
          target="_blank"
          rel="noopener noreferrer"
        >
          [More on CPS overreporting]
        </a>
        <br />
        Population by single year of age is from the Census Population Estimates Program (PEP), combined with CPS
        turnout and citizen-share rates — see {data.meta.construction}
        <br />
        Retrieved {data.meta.retrieved}. Full derivation, guardrails and known data quirks documented in{" "}
        <code>.claude/voter-age-spec-v2.md</code> and <code>scripts/generate_voter_age_data.py</code>.
      </footer>
    </div>
  );
}
