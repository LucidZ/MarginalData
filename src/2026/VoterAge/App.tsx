import { useJsonData } from "../../hooks/useJsonData";
import LoadingSpinner from "../../components/LoadingSpinner";
import AgeBeats from "./AgeBeats";
import Beat3 from "./Beat3";
import Beat4 from "./Beat4";
import { hero, loadErrorText, sourcesFootnote } from "./copy";
import type { VoterAgeData } from "./types";
import "./App.css";

export default function App() {
  const { data, error } = useJsonData<VoterAgeData>("/data/voter-age.json");

  if (error) {
    return (
      <div className="voa-root">
        <p>{loadErrorText(error.message)}</p>
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
        <h1>{hero.title}</h1>
        <p className="voa-intro">{hero.intro}</p>
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
        {sourcesFootnote(data.meta)}
      </footer>
    </div>
  );
}
