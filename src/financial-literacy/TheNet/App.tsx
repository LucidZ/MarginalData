import { useEffect, useRef, useState } from 'react';
import WaterfallViz from './WaterfallViz';
import FlowViz, { VizPhase } from './FlowViz';
import { Sources } from '../shared/Sources';
import { SeriesNav } from '../shared/SeriesNav';
import {
  ARCHETYPES,
  netMonthly,
} from './data';
import './App.css';

// ── Scroll steps ──────────────────────────────────────────────────────────────
const STEPS: { headline: string; body: string }[] = [
  // ── Student (steps 0–11) ─────────────────────────────────────────────────────
  {
    headline: 'Meet Alex',
    body: "$1,500/mo before taxes. Part-time barista, age 22. This is the full paycheck — everything. The month's job is to hold on to as much of it as possible.",
  },
  {
    headline: 'First, taxes',
    body: "$150 goes to federal taxes, FICA, and state before Alex sees a dollar. About 10% of this paycheck. Not negotiable — it leaves automatically.",
  },
  {
    headline: 'Rent',
    body: "$650/mo split with two roommates. Even divided, housing is 48% of take-home. It's usually the largest single expense — same amount, every month, no matter what.",
  },
  {
    headline: 'A phone plan',
    body: "$45/mo. Necessary, manageable — but committed. It shows up on the bill automatically whether the month goes well or not.",
  },
  {
    headline: 'Subscriptions',
    body: "$25/mo across streaming and apps. Each one is small. They're also fixed — they charge the same whether you use them or ignored them.",
  },
  {
    headline: 'Groceries',
    body: "$270/mo. Unlike rent, this one can flex. You can spend more or less depending on where you shop and how you cook — but you can't skip it.",
  },
  {
    headline: 'Getting around',
    body: "$80/mo for a bus pass and occasional rides. Transportation is a necessity. The question is just what form it takes.",
  },
  {
    headline: 'Dining out and social life',
    body: "$310/mo — coffees, splitting a bill, going out with friends. Easy to underestimate because no single purchase feels like much.",
  },
  {
    headline: 'The money just ran out.',
    body: "Dining and social costs $310 — but after everything above, only $280 was left. The last $30 goes on the card without thinking about it. It doesn't feel like debt. It feels like Tuesday.",
  },
  {
    headline: 'Everything else',
    body: "$170/mo for clothing, toiletries, and small purchases — and there's no income left to cover it. All of it goes on the card.",
  },
  {
    headline: "Seven expenses. Let's sort them.",
    body: "Random-looking charges become a pattern when grouped. Some are locked in by contract. Others flex. One you can't avoid at all. Learning to see these groups is the first step to managing them.",
  },
  {
    headline: 'The gap: −$200/mo',
    body: "After take-home and expenses, Alex ends each month $200 short. Not a crisis — but nothing building either. The shortfall gets covered somehow: a parent, a card, a savings account slowly draining.",
  },
  // ── First Job (steps 12–17) ───────────────────────────────────────────────────
  {
    headline: 'Four years later',
    body: "Alex is 26. Landed an analyst job at $54K/yr. $4,500/mo gross — three times the barista wage. This should change everything.",
  },
  {
    headline: 'Taxes come first — always',
    body: "$850 withheld before a single bill is paid. Federal income tax, FICA, state — about 19% effective. Take-home: $3,650.",
  },
  {
    headline: 'Fixed costs lock in',
    body: "Rent for a 1BR: $1,500. Car payment and insurance: $350. Phone, healthcare, subscriptions. $2,080 committed to contracts before any real choice is made.",
  },
  {
    headline: 'The necessities',
    body: "Groceries and gas. These can flex a little — but not much. They don't budge when a surprise hits.",
  },
  {
    headline: 'The flexible layer',
    body: "Dining, entertainment, clothing. The only layer that actually bends with intention. $930/mo — about a quarter of take-home.",
  },
  {
    headline: 'The gap: +$250/mo',
    body: "$250 left at the end of the month. That's 6.8% of take-home — slightly above the national savings rate. Better than before, definitely. Just not as much better as the raise felt like it would be.",
  },
  // ── Established (steps 18–23) ────────────────────────────────────────────────
  {
    headline: 'Eight years later',
    body: "Alex is 34. A partner, a house, $102K/yr combined. The income bar represents nearly double the take-home of eight years ago.",
  },
  {
    headline: 'The fixed costs grew with the income',
    body: "Mortgage, tax, insurance: $2,200. Two cars: $750. A family healthcare plan: $350. $3,300 locked in before a single grocery run — more than Alex's entire take-home at the first job.",
  },
  {
    headline: 'So did everything else',
    body: "Nicer groceries. Utilities on a house. More dining out — earned, at this point. A real vacation each year. Each one a reasonable call at the time.",
  },
  {
    headline: 'The gap: still +$250/mo',
    body: "Income grew $4,000/mo since the first job. The gap didn't move. Every raise brought a proportional expansion in spending. Lifestyle creep is silent and total.",
  },
  {
    headline: 'This isn\'t just Alex',
    body: "In 2022, roughly half of U.S. families saved nothing at all. And 16% of households earning over $216,000 saved nothing. The gap doesn't manage itself — not at $54K, not at $216K.",
  },
  {
    headline: 'Month after month',
    body: "That $250, repeated every month, is either building something or it isn't. What you do with the gap — and how to make it bigger — is what comes next.",
  },
];

// ── Viz mapping ───────────────────────────────────────────────────────────────
// archetypeIdx: 0 = Student (8 display items), 1 = First Job (11), 2 = Established (11)
// First Job items: [taxes, rent, car, phone, healthcare, subs, groceries, gas, dining, entertainment, clothing]
// Established items: [taxes, mortgage, cars, healthcare, subs, groceries, gas, utilities, dining, travel, clothing]
const VIZ_MAP: { archetypeIdx: number; visibleItems: number; phase: VizPhase; showDebt?: boolean }[] = [
  // ── Student (steps 0–11) ──────────────────────────────────────────────────
  { archetypeIdx: 0, visibleItems: 0,  phase: 'scatter'                    }, //  0: income bar, empty
  { archetypeIdx: 0, visibleItems: 1,  phase: 'scatter'                    }, //  1: taxes appear
  { archetypeIdx: 0, visibleItems: 2,  phase: 'scatter'                    }, //  2: rent appears
  { archetypeIdx: 0, visibleItems: 3,  phase: 'scatter'                    }, //  3: phone appears
  { archetypeIdx: 0, visibleItems: 4,  phase: 'scatter'                    }, //  4: subscriptions appear
  { archetypeIdx: 0, visibleItems: 5,  phase: 'scatter'                    }, //  5: groceries appear
  { archetypeIdx: 0, visibleItems: 6,  phase: 'scatter'                    }, //  6: bus pass appears
  { archetypeIdx: 0, visibleItems: 7,  phase: 'scatter'                    }, //  7: dining+social (income bills only, rect empties)
  { archetypeIdx: 0, visibleItems: 7,  phase: 'scatter', showDebt: true    }, //  8: ghost bills appear on dining
  { archetypeIdx: 0, visibleItems: 8,  phase: 'scatter', showDebt: true    }, //  9: clothing+misc (all ghost)
  { archetypeIdx: 0, visibleItems: 8,  phase: 'categorizing'               }, // 10: group animation
  { archetypeIdx: 0, visibleItems: 8,  phase: 'gap'                        }, // 11: student gap
  // ── First Job (steps 12–17) ───────────────────────────────────────────────
  { archetypeIdx: 1, visibleItems: 0,  phase: 'items'        }, // 12: income bar, nothing yet
  { archetypeIdx: 1, visibleItems: 1,  phase: 'items'        }, // 13: taxes land
  { archetypeIdx: 1, visibleItems: 6,  phase: 'items'        }, // 14: + all 5 fixed costs
  { archetypeIdx: 1, visibleItems: 8,  phase: 'items'        }, // 15: + groceries, gas
  { archetypeIdx: 1, visibleItems: 11, phase: 'items'        }, // 16: + dining, entertainment, clothing
  { archetypeIdx: 1, visibleItems: 11, phase: 'gap'          }, // 17: first job gap
  // ── Established (steps 18–23) ─────────────────────────────────────────────
  { archetypeIdx: 2, visibleItems: 0,  phase: 'items'        }, // 18: income bar, nothing yet
  { archetypeIdx: 2, visibleItems: 5,  phase: 'items'        }, // 19: + taxes + 4 fixed costs
  { archetypeIdx: 2, visibleItems: 11, phase: 'items'        }, // 20: + variable + discretionary
  { archetypeIdx: 2, visibleItems: 11, phase: 'gap'          }, // 21: established gap
  { archetypeIdx: 2, visibleItems: 11, phase: 'gap'          }, // 22: stats
  { archetypeIdx: 2, visibleItems: 11, phase: 'month2'       }, // 23: month 2 repeats
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
    title: '2022 Survey of Consumer Finances',
    url: 'https://www.federalreserve.gov/econres/scfindex.htm',
    note: '~47% of families saved nothing in 2022; 16% of families earning $216K+ saved nothing in 2022',
  },
  {
    org: 'IRS',
    title: 'Rev. Proc. 2024-40 — Tax Year 2025 Inflation Adjustments',
    url: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2025',
    note: 'Federal income tax brackets used in tax estimates for all three life stages',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
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

  useEffect(() => {
    const onScroll = () => {
      const el = stepRefs.current[currentStep];
      if (!el) return;
      const { top, height } = el.getBoundingClientRect();
      const p = (window.innerHeight / 2 - top) / height;
      setStepProgress(Math.max(0, Math.min(1, p)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [currentStep]);

  const vizProps = VIZ_MAP[Math.min(currentStep, VIZ_MAP.length - 1)];
  const scrollyArchetype = ARCHETYPES[vizProps.archetypeIdx];

  return (
    <div className="the-net-story">
      <header className="story-header">
        <SeriesNav current={1} />
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
            stage={vizProps.archetypeIdx}
            stepProgress={stepProgress}
            showDebt={vizProps.showDebt}
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
          <h2>Alex at three stages of life</h2>
          <p>
            Same person, same budget structure. Income nearly doubled from the first job to
            the established stage — but the monthly gap barely moved.
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

      {/* ── NEXT STORY ──────────────────────────────────────────────── */}
      <div className="next-story-card">
        <p className="next-story-label">Next in the series</p>
        <h2 className="next-story-title">The Cushion</h2>
        <p className="next-story-body">
          The net tells you the direction. The cushion tells you how much room you have when something breaks.
          Follow Alex's buffer through a full year — and find out where 37% of adults stand.
        </p>
        <a href="#/financial-literacy/the-cushion" className="next-story-link">
          Continue →
        </a>
      </div>
    </div>
  );
}
