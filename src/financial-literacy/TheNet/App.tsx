import { useEffect, useRef, useState } from 'react';
import WaterfallViz from './WaterfallViz';
import { Sources } from '../shared/Sources';
import {
  ARCHETYPES,
  SCROLLY_ARCHETYPE_IDX,
  HighlightType,
  netMonthly,
} from './data';
import './App.css';

// ── Scroll steps ──────────────────────────────────────────────────────────────
const STEPS: { highlight: HighlightType; headline: string; body: string }[] = [
  {
    highlight: 'all',
    headline: 'A median American family',
    body: 'Couple with one child. Combined income of $78,000 — right in the middle of the third income quintile according to BLS data. $6,500 arrives each month before anything is subtracted.',
  },
  {
    highlight: 'taxes',
    headline: 'Taxes come first',
    body: "Federal income tax, FICA, and state taxes take $1,300 before a single dollar reaches the checking account. That's 20% off the top — an effective rate, not marginal. Take-home: $5,200.",
  },
  {
    highlight: 'fixed',
    headline: 'Fixed: committed before the month begins',
    body: "Mortgage, car payments, healthcare, childcare, subscriptions. These don't flex. $3,795 is spoken for before any choice is made — 73% of take-home.",
  },
  {
    highlight: 'variable',
    headline: 'Variable: necessary but slightly controllable',
    body: "Groceries, gas, utilities. Not optional — but there's some give. $960 more. Combined with fixed expenses, 92% of take-home is now allocated.",
  },
  {
    highlight: 'discretionary',
    headline: 'Discretionary: where choice lives',
    body: 'Dining out, entertainment, clothing. The only layer with real flexibility. $400 — 8% of take-home, the only place either lever (spend less) can realistically move.',
  },
  {
    highlight: 'net',
    headline: 'The net: $45',
    body: "After everything, $45 remains. One car repair, one medical bill, one missed paycheck — and it's gone. The Fed's 2024 SHED survey found 37% of adults can't cover a $400 emergency with cash. Now you can see why.",
  },
];

// ── Sources ───────────────────────────────────────────────────────────────────
const SOURCES = [
  {
    org: 'U.S. Bureau of Labor Statistics',
    title: 'Consumer Expenditures — 2024',
    url: 'https://www.bls.gov/news.release/cesan.nr0.htm',
    note: 'Income quintile thresholds, average expenditures by quintile, and category shares',
  },
  {
    org: 'Federal Reserve',
    title: 'Report on the Economic Well-Being of U.S. Households (SHED) 2024',
    url: 'https://www.federalreserve.gov/publications/report-economic-well-being-us-households.htm',
    note: '37% stat: share of adults who cannot cover a $400 emergency with cash',
  },
  {
    org: 'IRS',
    title: 'Rev. Proc. 2024-40 — Tax Year 2025 Inflation Adjustments',
    url: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2025',
    note: 'Federal income tax brackets used in archetype tax estimates',
  },
  {
    org: 'Zillow / Apartment List',
    title: 'Rental Market Trends — 2024',
    url: 'https://www.apartmentlist.com/research/national-rent-data',
    note: 'Median rent estimates used in HCOL archetype',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [activeArchetype, setActiveArchetype] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // IntersectionObserver — fire when a step enters the viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const i = Number(entry.target.getAttribute('data-step'));
            setCurrentStep(i);
          }
        });
      },
      { threshold: 0.45 }
    );
    stepRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollyArchetype = ARCHETYPES[SCROLLY_ARCHETYPE_IDX];
  const step = STEPS[currentStep];

  return (
    <div className="the-net-story">
      <header className="story-header">
        <h1>The Net</h1>
        <p className="subtitle">
          Income minus spending. The single most important number in your financial life.
        </p>
      </header>

      {/* ── SCROLLY SECTION ─────────────────────────────────────────── */}
      <div className="scrolly-container">
        <div className="scrolly-viz">
          <WaterfallViz archetype={scrollyArchetype} highlight={step.highlight} />
        </div>

        <div className="scrolly-steps">
          {STEPS.map((s, i) => (
            <div
              key={i}
              ref={el => { stepRefs.current[i] = el; }}
              data-step={i}
              className="scrolly-step"
            >
              <div className="step-inner">
                <h2>{s.headline}</h2>
                <p>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ARCHETYPE EXPLORER ──────────────────────────────────────── */}
      <section className="archetype-explorer">
        <div className="explorer-header">
          <h2>Four households, four nets</h2>
          <p>
            The same waterfall structure, four very different outcomes. Two of these households
            earn more than the median — and still end the month with almost nothing.
          </p>
        </div>

        <div className="archetype-tabs">
          {ARCHETYPES.map((a, i) => {
            const net = netMonthly(a);
            const isNeg = net < 0;
            return (
              <button
                key={a.id}
                onClick={() => setActiveArchetype(i)}
                className={`archetype-tab ${i === activeArchetype ? 'active' : ''}`}
              >
                <span className="tab-name">{a.name}</span>
                <span className="tab-desc">{a.description}</span>
                <span
                  className="tab-net"
                  style={{ color: isNeg ? '#b5372d' : '#2d6a4f' }}
                >
                  {isNeg ? '' : '+'}{net < 0 ? '-' : ''}${Math.abs(net).toLocaleString()}/mo net
                </span>
              </button>
            );
          })}
        </div>

        <div className="explorer-viz">
          <WaterfallViz archetype={ARCHETYPES[activeArchetype]} highlight="all" />
        </div>

        <p className="quintile-note">{ARCHETYPES[activeArchetype].quintileNote}</p>
      </section>

      {/* ── SOURCES ─────────────────────────────────────────────────── */}
      <div className="story-footer">
        <Sources sources={SOURCES} />
      </div>
    </div>
  );
}
