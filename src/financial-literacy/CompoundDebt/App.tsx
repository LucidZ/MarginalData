import { useEffect, useRef, useState } from 'react';
import DebtBarViz from './DebtBarViz';
import { Sources } from '../shared/Sources';
import './App.css';

// ── Cycle 1: no payments ─────────────────────────────────────────────────────
const CYCLE1_ANNOTATIONS: Record<number, { headline: string; body: string }> = {
  0: {
    headline: 'Day 1: $1,000 on a credit card',
    body: 'A car repair. A medical bill. 24% APR — typical for new credit cards. What happens if you stop looking at the bill?',
  },
  1: {
    headline: 'Month 1: $1,020',
    body: '$20 in interest. That\'s 2% of your balance, charged every single month — whether you use the card again or not.',
  },
  6: {
    headline: 'Month 6: $1,126',
    body: 'Six months, $126 added. Each month\'s interest is a little larger than the last — because the base keeps growing.',
  },
  12: {
    headline: 'One year: $1,268',
    body: '$268 in interest. More than a quarter of what you borrowed, just for waiting twelve months.',
  },
  24: {
    headline: 'Two years: $1,608',
    body: 'Growing faster now. The monthly interest charge is $32 — 60% more than it was on day one.',
  },
  36: {
    headline: 'Three years: doubled',
    body: '$2,040. The original $1,000 is now just half of what you owe. The rest is pure interest — and it\'s accelerating.',
  },
  48: {
    headline: 'Four years: $2,587',
    body: 'Interest this month: $51. More than double what it was in month one. Same rate, bigger base.',
  },
  60: {
    headline: 'Five years: $3,281',
    body: '$2,281 in interest on $1,000. You never bought another thing — compound interest did the rest.',
  },
};

// ── Transition ────────────────────────────────────────────────────────────────
const TRANSITION_ANNOTATION = {
  headline: 'What if you pay the minimum?',
  body: 'Same $1,000, same 24% rate. The minimum payment: 1% of your balance plus that month\'s interest — or $25, whichever is more. Each green slice is one month\'s payment.',
};

// ── Cycle 2: minimum payments ─────────────────────────────────────────────────
const CYCLE2_ANNOTATIONS: Record<number, { headline: string; body: string }> = {
  0: {
    headline: 'Same starting line',
    body: 'Red bars: what you owe. Green slices at the top: each month\'s payment. The ghost bars show the no-payment nightmare.',
  },
  1: {
    headline: 'Month 1: $990',
    body: 'Payment: $30. Interest: $20. Only $10 went to principal — that thin green slice barely dents the red.',
  },
  6: {
    headline: 'Month 6: $941',
    body: 'Six green slices so far — $174 paid, but the balance only dropped $59. The slices are thin because the payments are small.',
  },
  12: {
    headline: 'One year: $886',
    body: 'Look at all those green slices. Twelve payments, $344 total — but the red bars have barely budged.',
  },
  24: {
    headline: 'Two years: $782',
    body: 'Your payment has dropped to the $25 floor. The green slices keep stacking up — but the red keeps resisting.',
  },
  36: {
    headline: 'Three years: $656',
    body: 'Still owe two-thirds. Those green slices add up to over $1,000 now — more than the original debt.',
  },
  48: {
    headline: 'Four years: $496',
    body: 'Half the debt remains. The green slices: quiet, steady, relentless. But where did all that money go?',
  },
  60: {
    headline: 'Five years: still $294 to go',
    body: 'Sixty green slices. Sixty payments. Still not done. Let\'s see where all that money actually went.',
  },
};

// ── Gather annotations ───────────────────────────────────────────────────────
const GATHER_ANNOTATIONS: Record<number, { headline: string; body: string }> = {
  0: {
    headline: 'Every payment, stacked',
    body: 'Watch the green slices gather into a single column — sixty monthly payments, combined.',
  },
  7: {
    headline: 'The true cost',
    body: 'Left: what you paid. Right: what you borrowed. The gap between them — that\'s pure interest. And you still owe $294.',
  },
};

// ── Step layout ───────────────────────────────────────────────────────────────
// Cycle 1: 61 steps (months 0–60)
// Transition: 1 step
// Cycle 2: 61 steps (months 0–60)
// Gather: 10 steps
const GATHER_START = 123;
const GATHER_STEPS = 10;
const TOTAL_STEPS = 61 + 1 + 61 + GATHER_STEPS;

const STEPS = Array.from({ length: TOTAL_STEPS }, (_, i) => {
  if (i <= 60) {
    return { annotation: CYCLE1_ANNOTATIONS[i] ?? null };
  } else if (i === 61) {
    return { annotation: TRANSITION_ANNOTATION };
  } else if (i <= 122) {
    const month = i - 62;
    return { annotation: CYCLE2_ANNOTATIONS[month] ?? null };
  } else {
    const gatherStep = i - GATHER_START;
    return { annotation: GATHER_ANNOTATIONS[gatherStep] ?? null };
  }
});

const SOURCES = [
  {
    org: 'Federal Reserve',
    title: 'Consumer Credit — G.19',
    url: 'https://www.federalreserve.gov/releases/g19/current/',
    note: '24% APR reflects average credit card interest rate for accounts assessed interest (2024)',
  },
  {
    org: 'CFPB',
    title: 'The Consumer Credit Card Market',
    url: 'https://www.consumerfinance.gov/data-research/research-reports/the-consumer-credit-card-market/',
    note: 'Minimum payment: 1% of balance + interest, or $25 floor — a common issuer formula',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const onScroll = () => {
      const center = window.innerHeight / 2;
      const refs = stepRefs.current;
      for (let i = refs.length - 1; i >= 0; i--) {
        const el = refs[i];
        if (!el) continue;
        const { top } = el.getBoundingClientRect();
        if (top <= center) {
          setCurrentStep(i);
          return;
        }
      }
      setCurrentStep(0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  let cycle: 1 | 2;
  let month: number;
  let gatherProgress = 0;

  if (currentStep <= 60) {
    cycle = 1;
    month = currentStep;
  } else if (currentStep === 61) {
    cycle = 1;
    month = 60;
  } else if (currentStep <= 122) {
    cycle = 2;
    month = currentStep - 62;
  } else {
    cycle = 2;
    month = 60;
    gatherProgress = Math.min(
      (currentStep - GATHER_START) / (GATHER_STEPS - 1),
      1,
    );
  }

  return (
    <div className="compound-debt-story">
      <header className="story-header">
        <p className="series-label">Financial Literacy</p>
        <h1>The Other Side</h1>
        <p className="subtitle">
          Compound interest is the most powerful force in finance. When it's
          working against you — on credit card debt at 24% — the math is the
          same, but the story is very different.
        </p>
      </header>

      <div className="scrolly-container">
        <div className="scrolly-viz">
          <DebtBarViz
            currentMonth={month}
            cycle={cycle}
            gatherProgress={gatherProgress}
          />
        </div>

        <div className="scrolly-steps">
          {STEPS.map((s, i) => (
            <div
              key={i}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              data-step={i}
              className="scrolly-step"
            >
              {s.annotation && (
                <div className="step-inner">
                  <h2>{s.annotation.headline}</h2>
                  <p>{s.annotation.body}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="story-footer">
        <Sources sources={SOURCES} />
      </div>
    </div>
  );
}
