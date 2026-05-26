import { useState, useCallback } from 'react';
import DecileViz, { DecileTooltip, type HoverInfo } from './DecileViz';
import { CATEGORIES } from './data';
import { Sources } from '../shared/Sources';
import './App.css';

type Mode = 'absolute' | 'share';

const SOURCES = [
  {
    org: 'U.S. Bureau of Labor Statistics',
    title: 'Table 1110: Deciles of income before taxes — Consumer Expenditure Surveys, 2024',
    url: 'https://www.bls.gov/cex/tables/calendar-year/mean-shares-standard-error/cu-income-decile-before-taxes-2024.pdf',
    note: 'Income means, total spending, and category breakdowns by income decile',
  },
];

export default function App() {
  const [mode, setMode] = useState<Mode>('absolute');
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const handleHover = useCallback((info: HoverInfo | null) => setHover(info), []);

  function toggleHighlight(key: string) {
    setHighlightKey(h => (h === key ? null : key));
  }

  return (
    <div className="bd-story">
      <div className="bd-header">
        <h1>Where the money goes</h1>
        <p className="bd-subtitle">
          Annual spending broken down by income decile, U.S. households, 2024
        </p>
      </div>

      <div className="bd-chart-section">
        <div className="bd-controls">
          <div className="bd-mode-toggle">
            <button
              className={mode === 'absolute' ? 'active' : ''}
              onClick={() => setMode('absolute')}
            >
              Annual spending ($)
            </button>
            <button
              className={mode === 'share' ? 'active' : ''}
              onClick={() => setMode('share')}
            >
              Share of spending (%)
            </button>
          </div>
          <div className="bd-x-note">Mean income shown below each bar</div>
        </div>

        <div className="bd-chart-wrap">
          <DecileViz mode={mode} highlightKey={highlightKey} onHover={handleHover} />
          {hover && <DecileTooltip info={hover} />}
        </div>

        <div className="bd-legend">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              className={`bd-legend-item ${highlightKey === cat.key ? 'active' : ''} ${highlightKey !== null && highlightKey !== cat.key ? 'dimmed' : ''}`}
              onClick={() => toggleHighlight(cat.key)}
              title="Click to highlight"
            >
              <span className="bd-swatch" style={{ background: cat.color }} />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bd-insight">
        <p>
          <strong>The savings gap.</strong> At the lowest income decile, households put just
          1.4% of their spending toward savings and insurance — about $455/year. At the
          highest decile, that share is 19.4%, or $34,737/year. Click{' '}
          <button className="bd-inline-highlight" onClick={() => toggleHighlight('savings')}>
            Savings & Insurance
          </button>{' '}
          above to see the difference.
        </p>
        <p>
          <strong>Housing burden.</strong> Housing consumes 42% of spending in the bottom
          decile, but only 29% at the top — yet in absolute terms, top earners spend 4× more.
          The weight feels different even when the share looks similar.
        </p>
      </div>

      <div className="bd-footer">
        <Sources sources={SOURCES} />
      </div>
    </div>
  );
}
