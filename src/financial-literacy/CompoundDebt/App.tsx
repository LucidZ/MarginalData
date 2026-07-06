import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DebtBarViz from './DebtBarViz';
import { Sources } from '../shared/Sources';
import './App.css';

// ── Cycle 1: no payments (7 years) ──────────────────────────────────────────
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
    body: 'Two hundred and thirty percent of what you borrowed — and the debt is still accelerating.',
  },
  72: {
    headline: 'Six years: $4,161',
    body: 'Monthly interest: $83. The bank now earns more each month from your silence than you originally spent on that car repair.',
  },
  84: {
    headline: 'Seven years: $5,278',
    body: 'Monthly interest: $106 — five times what it was on day one. Same rate. Zero new purchases.',
  },
};

// ── Transition ────────────────────────────────────────────────────────────────
const TRANSITION_ANNOTATION = {
  headline: 'What if you pay the minimum?',
  body: 'Same $1,000, same 24% rate. The minimum payment: 1% of your balance plus that month\'s interest — or $25, whichever is more. Green above the line: what you paid. Red below: what you still owe.',
};

// ── Cycle 2: minimum payments (7 years) ──────────────────────────────────────
const CYCLE2_ANNOTATIONS: Record<number, { headline: string; body: string }> = {
  0: {
    headline: 'Same starting line',
    body: 'Back to $1,000. Same rate. But now you make the minimum payment every month.',
  },
  1: {
    headline: 'Month 1: $990',
    body: 'Payment: $30. Interest: $20. Only $10 actually reduces your debt — the rest goes straight to the bank.',
  },
  6: {
    headline: 'Month 6: $941',
    body: 'Six payments totaling $174 — but the balance has only dropped $59. Most of your money feeds the interest.',
  },
  12: {
    headline: 'One year: $886',
    body: '$344 paid so far. The debt? Down just $114. For every dollar of progress, you\'ve paid three in interest.',
  },
  24: {
    headline: 'Two years: $782',
    body: 'Your payment has dropped to the $25 floor. You\'ve paid over $600, but more than half went to interest.',
  },
  36: {
    headline: 'Three years: $656',
    body: 'Over $1,000 in payments now — more than the original debt. And you still owe two-thirds.',
  },
  48: {
    headline: 'Four years: $496',
    body: 'Half the balance remains. The payments are steady, quiet, relentless — but so is the interest.',
  },
  60: {
    headline: 'Five years: still $294 to go',
    body: 'Sixty payments. Over $1,500 spent. Not done yet.',
  },
  72: {
    headline: 'Year 6: almost there',
    body: 'Just $39 left. One more $25 payment drops it below the minimum — the bank takes the rest.',
  },
  75: {
    headline: 'Paid off — month 74',
    body: 'Six years, two months. Over $1,900 paid to erase a $1,000 balance.',
  },
  84: {
    headline: 'Year 7: free',
    body: 'Ten months since payoff. Let\'s see where all that money actually went.',
  },
};

// ── Gather annotations ───────────────────────────────────────────────────────
const GATHER_ANNOTATIONS: Record<number, { headline: string; body: string }> = {
  0: {
    headline: 'Every payment, stacked',
    body: 'Watch the green slices gather into a single column — 74 monthly payments, combined.',
  },
  22: {
    headline: 'The true cost',
    body: 'Left: what you paid. Right: what you borrowed. The gap between them — that\'s pure interest. Nearly double the original debt, just to break even.',
  },
};

// ── Step layout ───────────────────────────────────────────────────────────────
// Cycle 1: 85 steps (months 0–84)
// Transition: 1 step
// Cycle 2: 85 steps (months 0–84)
// Gather: 30 steps
const CYCLE1_STEPS = 85;
const CYCLE2_STEPS = 85;
const GATHER_STEPS = 30;
const GATHER_START = CYCLE1_STEPS + 1 + CYCLE2_STEPS; // 171
const TOTAL_STEPS = CYCLE1_STEPS + 1 + CYCLE2_STEPS + GATHER_STEPS; // 201

const STEPS = Array.from({ length: TOTAL_STEPS }, (_, i) => {
  if (i <= 84) {
    return { annotation: CYCLE1_ANNOTATIONS[i] ?? null };
  } else if (i === 85) {
    return { annotation: TRANSITION_ANNOTATION };
  } else if (i <= 170) {
    const month = i - 86;
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

  if (currentStep <= 84) {
    cycle = 1;
    month = currentStep;
  } else if (currentStep === 85) {
    cycle = 1;
    month = 84;
  } else if (currentStep <= 170) {
    cycle = 2;
    month = currentStep - 86;
  } else {
    cycle = 2;
    month = 84;
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
        <div className="calc-cta">
          <p className="calc-cta-text">What does this look like with your rate and balance?</p>
          <Link
            to="/financial-literacy/compound-debt/calculator?balance=1000&rate=24&payment=50"
            className="calc-cta-link"
          >
            Run your own numbers →
          </Link>
        </div>
        <Sources sources={SOURCES} />
      </div>
    </div>
  );
}
