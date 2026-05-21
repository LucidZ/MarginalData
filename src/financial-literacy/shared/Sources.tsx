import './Sources.css';

export interface Source {
  org: string;
  title: string;
  url: string;
  note?: string;
}

export function Sources({ sources }: { sources: Source[] }) {
  return (
    <footer className="fl-sources">
      <p className="fl-sources-heading">Sources</p>
      <ul>
        {sources.map((s, i) => (
          <li key={i}>
            <span className="fl-sources-org">{s.org}:</span>{' '}
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
            {s.note && <span className="fl-sources-note"> — {s.note}</span>}
          </li>
        ))}
      </ul>
    </footer>
  );
}
