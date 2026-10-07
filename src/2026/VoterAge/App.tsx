import { useJsonData } from "../../hooks/useJsonData";
import LoadingSpinner from "../../components/LoadingSpinner";
import AgeBeats from "./AgeBeats";
import Explorer from "./Explorer";
import { hero, loadErrorText, sourcesFootnote, voteCta } from "./copy";
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

      <Explorer data={data} />

      <section className="voa-cta" aria-labelledby="voa-cta-heading">
        <h2 id="voa-cta-heading">{voteCta.heading}</h2>
        <p>{voteCta.body}</p>
        <a className="voa-cta-button" href={voteCta.href} target="_blank" rel="noopener noreferrer">
          {voteCta.button} <span aria-hidden="true">→</span>
        </a>
        <p className="voa-cta-note">{voteCta.note}</p>
      </section>

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
