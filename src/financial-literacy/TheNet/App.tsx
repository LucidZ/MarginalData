import { useEffect, useRef, useState } from 'react';
import WaterfallViz from './WaterfallViz';
import FlowViz, { VizPhase } from './FlowViz';
import { Sources } from '../shared/Sources';
import {
  ARCHETYPES,
  SCROLLY_ARCHETYPE_IDX,
  netMonthly,
} from './data';
import './App.css';

// ── Scroll steps ──────────────────────────────────────────────────────────────
const STEPS: { headline: string; body: string }[] = [
  {
    headline: 'Payday',
    body: '$6,500 arrives at the start of the month. Before a single bill is paid, this is everything — the full gross. The job now: keep as much of it as possible.',
  },
  {
    headline: 'Taxes come first — before you see a dime',
    body: "$1,300 is withheld before the paycheck hits the bank. Federal income tax, FICA, state. You never get the choice to spend it. That's 20% of gross, gone before any decision is made.",
  },
  {
    headline: 'The mortgage and cars',
    body: "The two biggest fixed costs lock in next. $2,100 for the mortgage — principal, interest, property tax, insurance bundled together. $700 for two cars — payments and insurance. These are contracts. They don't budge.",
  },
  {
    headline: 'Healthcare, childcare, subscriptions',
    body: "Healthcare eats $420 (family plan). Childcare takes $500 — one of the fastest-growing household expenses in America. Subscriptions add up quietly: streaming, software, memberships. Another $75. Every one was a decision. Most feel non-negotiable now.",
  },
  {
    headline: 'Groceries, gas, utilities',
    body: "Necessary but somewhat flexible. Groceries: $580. Gas: $180. Utilities: $200. Unlike fixed costs, these can bend a little with effort. But they don't bend much.",
  },
  {
    headline: 'The only truly flexible layer',
    body: "$280 on dining and entertainment. $120 on clothing and miscellaneous. This is where real choice lives — and it's 8% of take-home. The only lever most families actually have.",
  },
  {
    headline: "Let's organize this",
    body: "Four categories. Taxes you never touch. Fixed costs you've committed to. Variable necessities. And a sliver of discretionary. The structure looks the same for almost everyone — only the dollar amounts change.",
  },
  {
    headline: 'The gap: $45',
    body: "After everything, $45 remains. One car repair, one medical bill, one missed shift — and it's gone. The Fed's 2024 SHED survey found 37% of adults can't cover a $400 emergency with cash. Now you can see why.",
  },
  {
    headline: 'Month 2. Same story.',
    body: "Another paycheck arrives. The same fixed costs are waiting. The same groceries, the same gas. The gap, if there is one, begins to accumulate. The cycle repeats.",
  },
  {
    headline: 'Month after month. The same $45.',
    body: "The gap is a flow — what you generate each month. Savings and debt are stocks — what has accumulated over time. That $45, repeated month after month, is exactly what the next section is about.",
  },
];

// ── Viz mapping: step index → FlowViz props ───────────────────────────────────
// Median Family has 11 display items (1 taxes + 10 budget items)
const VIZ_MAP: { visibleItems: number; phase: VizPhase }[] = [
  { visibleItems: 0,  phase: 'items'   }, // 0: payday
  { visibleItems: 1,  phase: 'items'   }, // 1: taxes
  { visibleItems: 3,  phase: 'items'   }, // 2: + mortgage, cars
  { visibleItems: 6,  phase: 'items'   }, // 3: + healthcare, childcare, subscriptions
  { visibleItems: 9,  phase: 'items'   }, // 4: + groceries, gas, utilities
  { visibleItems: 11, phase: 'items'   }, // 5: + dining, clothing
  { visibleItems: 11, phase: 'grouped' }, // 6: group into categories
  { visibleItems: 11, phase: 'gap'     }, // 7: highlight gap
  { visibleItems: 11, phase: 'month2'  }, // 8: month 2 auto-animates
  { visibleItems: 11, phase: 'month3'  }, // 9: month 3 auto-animates
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

  // IntersectionObserver — fire when a step is centered in the viewport
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
      { threshold: 0.4 }
    );
    stepRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollyArchetype = ARCHETYPES[SCROLLY_ARCHETYPE_IDX];
  const vizProps = VIZ_MAP[Math.min(currentStep, VIZ_MAP.length - 1)];

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
          <FlowViz
            archetype={scrollyArchetype}
            visibleItems={vizProps.visibleItems}
            phase={vizProps.phase}
          />
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
