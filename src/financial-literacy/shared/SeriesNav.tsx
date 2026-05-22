import './SeriesNav.css';

const CHAPTERS = [
  { num: 1, title: 'The Net', path: '#/financial-literacy/the-net' },
  { num: 2, title: 'The Cushion', path: '#/financial-literacy/the-cushion' },
  { num: 3, title: 'The Snowball', path: '#/financial-literacy/the-compound' },
];

interface SeriesNavProps {
  current: 1 | 2 | 3;
}

export function SeriesNav({ current }: SeriesNavProps) {
  return (
    <nav className="fl-series-nav" aria-label="Series navigation">
      <span className="fl-series-nav-label">Financial Literacy</span>
      {CHAPTERS.map((ch, i) => (
        <span key={ch.num} className="fl-series-nav-entry">
          <span className="fl-series-nav-sep">{i === 0 ? '·' : '·'}</span>
          {ch.num === current ? (
            <span className="fl-series-nav-current">{ch.num}. {ch.title}</span>
          ) : (
            <a href={ch.path} className="fl-series-nav-link">
              {ch.num}. {ch.title}
            </a>
          )}
        </span>
      ))}
    </nav>
  );
}
