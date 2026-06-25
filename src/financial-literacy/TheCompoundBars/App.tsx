import { useEffect, useRef, useState } from 'react';
import StackedBarViz from './StackedBarViz';
import { Sources } from '../shared/Sources';
import { SeriesNav } from '../shared/SeriesNav';
import './App.css';

// ── Cycle 1: simple interest only ─────────────────────────────────────────────
const CYCLE1_ANNOTATIONS: Record<number, { headline: string; body: string }> = {
  0: {
    headline: 'Day 1: $100, invested once',
    body: 'Same setup: $100 into a diversified index fund, 7% annually. But first — what if your gains never compounded? What if you earned a flat $7 every year, forever?',
  },
  1: {
    headline: 'Year 1: $107',
    body: '$7 earned. With simple interest, that\'s all you\'ll ever earn per year — always 7% of your original $100, nothing more.',
  },
  10: {
    headline: 'Year 10: $170',
    body: 'Ten bars, each one $7 taller than the last. Steady, predictable, linear. At this pace, doubling takes over 14 years.',
  },
  20: {
    headline: 'Year 20: $240',
    body: '$140 in interest after twenty years. The bars march upward at the same pace — nothing accelerates, nothing compounds.',
  },
  40: {
    headline: 'Year 40: $380',
    body: '$280 earned on $100 invested. Not bad. But notice how much empty space the chart has left. What\'s missing?',
  },
};

// ── Transition ────────────────────────────────────────────────────────────────
const TRANSITION_ANNOTATION = {
  headline: 'Now let\'s add compounding',
  body: 'Same $100, same 7% — but now each year\'s interest stays invested and earns its own returns. Watch for the gold.',
};

// ── Cycle 2: compound interest revealed ───────────────────────────────────────
const CYCLE2_ANNOTATIONS: Record<number, { headline: string; body: string }> = {
  0: {
    headline: 'Same $100, new picture',
    body: 'The green and light green are the same — your principal and simple interest. But now a third layer appears: interest on interest, in gold.',
  },
  5: {
    headline: 'Year 5: barely visible',
    body: 'The gold is there — less than $5. At this point, simple and compound look almost identical. The difference comes later.',
  },
  10: {
    headline: 'Year 10: $197 vs $170',
    body: 'Compound total: $197. That\'s $27 more than simple interest alone. The gold layer is growing faster than the light green ever will.',
  },
  20: {
    headline: 'Year 20: gold exceeds your $100',
    body: '$387 total. The compound bonus alone is $147 — more than your entire original investment. Interest on interest is now the engine.',
  },
  30: {
    headline: 'Year 30: the snowball',
    body: '$761 total. The gold is $451 — it dominates the bar. This year alone, your money earned $50. Half of what you started with, in a single year.',
  },
  40: {
    headline: 'Year 40: the full picture',
    body: '$1,497. Simple interest would\'ve given you $380. Compounding gave you four times that. Same $100, same rate, same patience — radically different result.',
  },
};

// ── Step layout ───────────────────────────────────────────────────────────────
// Cycle 1: 41 steps (years 0–40)
// Transition: 1 step
// Cycle 2: 41 steps (years 0–40)
const TOTAL_STEPS = 83;

const STEPS = Array.from({ length: TOTAL_STEPS }, (_, i) => {
  if (i <= 40) {
    return { annotation: CYCLE1_ANNOTATIONS[i] ?? null };
  } else if (i === 41) {
    return { annotation: TRANSITION_ANNOTATION };
  } else {
    const year = i - 42;
    return { annotation: CYCLE2_ANNOTATIONS[year] ?? null };
  }
});

const SOURCES = [
  {
    org: 'Vanguard',
    title: 'Vanguard economic and market outlook 2024',
    url: 'https://institutional.vanguard.com/insights/article/economic-market-outlook-2024',
    note: '7% nominal (real ~4–5%) used as long-run equity return assumption; this model uses 7% real for illustrative clarity',
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
  let year: number;

  if (currentStep <= 40) {
    cycle = 1;
    year = currentStep;
  } else if (currentStep === 41) {
    cycle = 1;
    year = 40;
  } else {
    cycle = 2;
    year = currentStep - 42;
  }

  return (
    <div className="compound-bars-story">
      <header className="story-header">
        <SeriesNav current={3} />
        <h1>The Snowball</h1>
        <p className="subtitle">
          Compound interest is simple — returns earn returns. The part people miss is how
          quickly the math shifts from working against you to working for you.
        </p>
      </header>

      <div className="scrolly-container">
        <div className="scrolly-viz">
          <StackedBarViz currentYear={year} cycle={cycle} />
        </div>

        <div className="scrolly-steps">
          {STEPS.map((s, i) => (
            <div
              key={i}
              ref={el => { stepRefs.current[i] = el; }}
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
