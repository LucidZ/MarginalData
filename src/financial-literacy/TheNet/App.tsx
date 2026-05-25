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
  // ── Student (steps 0–15) ─────────────────────────────────────────────────────
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
    body: "$50/mo on autopay. Necessary, manageable — but committed. It charges the same whether the month goes well or not.",
  },
  {
    headline: 'Netflix + Spotify',
    body: "$20/mo, also on autopay. Each feels optional when you sign up. Together they just become another line on the bank statement.",
  },
  {
    headline: 'Trader Joe\'s, twice a week',
    body: "$160/mo in grocery runs. Not a budget — just what it costs when you buy what you need. Can flex, but not by much.",
  },
  {
    headline: 'Corner store + CVS runs',
    body: "$110/mo. The snacks, the paper towels, the drugstore pick-up on the way home. Each one feels like nothing. Together they're real.",
  },
  {
    headline: 'Metro card + a few Ubers',
    body: "$80/mo. The pass covers the commute. The rides fill in the gaps — late nights, bad weather, when the bus just doesn't go there.",
  },
  {
    headline: 'Morning coffee, most days',
    body: "$60/mo. A $4 coffee doesn't feel like a decision. But it's there every morning on the statement, five days a week.",
  },
  {
    headline: 'Lunch delivery, a few times',
    body: "$80/mo. Not every day — but when the fridge is empty or a friend suggests it, it happens. A few orders a week adds up quietly.",
  },
  {
    headline: 'The money runs out here.',
    body: "Friday dinner, one bar tab — $170/mo. But after everything above, only $140 was left. The last $30 goes on the card without deciding to. It doesn't feel like debt. It feels like a regular Friday.",
  },
  {
    headline: 'The card absorbs it.',
    body: "That $30 doesn't hurt today — it's just a charge. The statement comes later, and by then there are more charges stacked on top of it.",
  },
  {
    headline: 'New jeans, a hoodie',
    body: "$90. There's no income left — it goes on the card. It was a reasonable purchase. So was everything else.",
  },
  {
    headline: 'Shampoo, razors, one Amazon order',
    body: "$80 in things you needed. All charged. The sum of small decisions you didn't track adds up to $200 over budget.",
  },
  {
    headline: "Twelve expenses. Let's sort them.",
    body: "Random-looking charges become a pattern when grouped. Some are locked in by contract. Others flex. One you can't avoid at all. Learning to see these groups is the first step to managing them.",
  },
  {
    headline: 'The gap: −$200/mo',
    body: "After take-home and expenses, Alex ends each month $200 short. Not a crisis — but nothing building either. The shortfall gets covered somehow: a parent, a card, a savings account slowly draining.",
  },
  // ── First Job (steps 16–21) ───────────────────────────────────────────────────
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
  // ── Established (steps 22–27) ────────────────────────────────────────────────
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
// archetypeIdx: 0 = Student (12 display items), 1 = First Job (11), 2 = Established (11)
// Student items: [taxes, rent, phone, subs, grocery runs, snacks+household, bus+rides,
//                 coffee, lunch, dinner, clothing, toiletries+misc]
// First Job items: [taxes, rent, car, phone, healthcare, subs, groceries, gas, dining, entertainment, clothing]
// Established items: [taxes, mortgage, cars, healthcare, subs, groceries, gas, utilities, dining, travel, clothing]
const VIZ_MAP: { archetypeIdx: number; visibleItems: number; phase: VizPhase; showDebt?: boolean; allLanded?: boolean }[] = [
  // ── Student (steps 0–15) ──────────────────────────────────────────────────
  { archetypeIdx: 0, visibleItems: 0,  phase: 'scatter'                    }, //  0: income bar, empty
  { archetypeIdx: 0, visibleItems: 1,  phase: 'scatter'                    }, //  1: taxes
  { archetypeIdx: 0, visibleItems: 2,  phase: 'scatter'                    }, //  2: rent
  { archetypeIdx: 0, visibleItems: 3,  phase: 'scatter'                    }, //  3: phone
  { archetypeIdx: 0, visibleItems: 4,  phase: 'scatter'                    }, //  4: subscriptions
  { archetypeIdx: 0, visibleItems: 5,  phase: 'scatter'                    }, //  5: grocery runs
  { archetypeIdx: 0, visibleItems: 6,  phase: 'scatter'                    }, //  6: snacks & household
  { archetypeIdx: 0, visibleItems: 7,  phase: 'scatter'                    }, //  7: bus pass + rides
  { archetypeIdx: 0, visibleItems: 8,  phase: 'scatter'                    }, //  8: coffee & cafés
  { archetypeIdx: 0, visibleItems: 9,  phase: 'scatter'                    }, //  9: lunch out
  { archetypeIdx: 0, visibleItems: 10, phase: 'scatter'                    }, // 10: dinner & going out (income runs out mid-item)
  { archetypeIdx: 0, visibleItems: 10, phase: 'scatter', showDebt: true, allLanded: true }, // 11: ghost bills reveal on dinner
  { archetypeIdx: 0, visibleItems: 11, phase: 'scatter', showDebt: true    }, // 12: new clothing (all ghost)
  { archetypeIdx: 0, visibleItems: 12, phase: 'scatter', showDebt: true    }, // 13: toiletries & misc (all ghost)
  { archetypeIdx: 0, visibleItems: 12, phase: 'categorizing'               }, // 14: group animation
  { archetypeIdx: 0, visibleItems: 12, phase: 'gap'                        }, // 15: student gap
  // ── First Job (steps 16–21) ───────────────────────────────────────────────
  { archetypeIdx: 1, visibleItems: 0,  phase: 'items'        }, // 16: income bar, nothing yet
  { archetypeIdx: 1, visibleItems: 1,  phase: 'items'        }, // 17: taxes land
  { archetypeIdx: 1, visibleItems: 6,  phase: 'items'        }, // 18: + all 5 fixed costs
  { archetypeIdx: 1, visibleItems: 8,  phase: 'items'        }, // 19: + groceries, gas
  { archetypeIdx: 1, visibleItems: 11, phase: 'items'        }, // 20: + dining, entertainment, clothing
  { archetypeIdx: 1, visibleItems: 11, phase: 'gap'          }, // 21: first job gap
  // ── Established (steps 22–27) ─────────────────────────────────────────────
  { archetypeIdx: 2, visibleItems: 0,  phase: 'items'        }, // 22: income bar, nothing yet
  { archetypeIdx: 2, visibleItems: 5,  phase: 'items'        }, // 23: + taxes + 4 fixed costs
  { archetypeIdx: 2, visibleItems: 11, phase: 'items'        }, // 24: + variable + discretionary
  { archetypeIdx: 2, visibleItems: 11, phase: 'gap'          }, // 25: established gap
  { archetypeIdx: 2, visibleItems: 11, phase: 'gap'          }, // 26: stats
  { archetypeIdx: 2, visibleItems: 11, phase: 'month2'       }, // 27: month 2 repeats
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
            allLanded={vizProps.allLanded}
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
