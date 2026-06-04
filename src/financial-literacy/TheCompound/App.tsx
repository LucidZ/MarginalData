import { useEffect, useRef, useState } from 'react';
import SnowballViz from './SnowballViz';
import { Sources } from '../shared/Sources';
import { SeriesNav } from '../shared/SeriesNav';
import './App.css';

// ── Annotations at key years ───────────────────────────────────────────────────
// One step per year (years 0–40). Only annotated years show text.
// Equal step height → constant scroll-per-year pacing.
const ANNOTATIONS: Record<number, { headline: string; body: string }> = {
  0: {
    headline: 'Day 1: $100, invested once',
    body: 'No future contributions. No active management. Just $100 put into a diversified index fund and left alone, earning 7% annually — the market\'s long-run average.',
  },
  1: {
    headline: 'Year 1: $107',
    body: 'By year\'s end: $107. Simple. But the compound interest mechanism is now running — each year\'s gain becomes next year\'s starting point.',
  },
  2: {
    headline: 'Year 2: compounding starts',
    body: 'The $7 from year one stayed invested. Now it\'s earning too. The compound bonus is tiny — less than a dollar — but the mechanism is in place. Light green grows linearly; the gold layer grows faster.',
  },
  3: {
    headline: 'Year 3: three layers',
    body: 'Green: your original $100. Light green: the simple interest your $100 has earned. Gold: the interest earned by that interest. The gold is invisible yet. But it grows faster than the other two — forever.',
  },
  11: {
    headline: 'Year 11: it doubled — gold appears',
    body: 'Your $100 is now $210. The Rule of 72: divide 72 by your return rate and that\'s roughly how long doubling takes. At 7%, about 10 years. The gold layer is now visible — compound interest is starting to show.',
  },
  20: {
    headline: 'Year 20: gold crosses green',
    body: 'Your $100 is now $387. The compound bonus is now larger than your original $100 investment. Interest on interest is outearning your entire starting amount.',
  },
  30: {
    headline: 'Year 30: the snowball has mass',
    body: 'Your $100 is now $761. In year 30 alone, it earned $50 — half of what you started with. The gold is now the majority of what you have. And the base keeps growing, so next year\'s interest will be larger still.',
  },
  40: {
    headline: 'Year 40: your money earns itself back',
    body: 'Your $100 is now $1,497. This year it earned $98 — nearly what you started with 40 years ago. You\'ve made $1,397 on a single $100 investment you never touched. That\'s compounding.',
  },
};

// One step per year, 0–40
const STEPS = Array.from({ length: 41 }, (_, year) => ({
  year,
  annotation: ANNOTATIONS[year] ?? null,
}));

// ── Sources ────────────────────────────────────────────────────────────────────
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
  const [stepProgress, setStepProgress] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Single scroll handler: find the step whose top is at or above the viewport
  // center, compute progress within it. Replaces IntersectionObserver + separate
  // scroll effect — works correctly with many small equal-height steps.
  useEffect(() => {
    const onScroll = () => {
      const center = window.innerHeight / 2;
      const refs = stepRefs.current;
      for (let i = refs.length - 1; i >= 0; i--) {
        const el = refs[i];
        if (!el) continue;
        const { top, height } = el.getBoundingClientRect();
        if (top <= center) {
          setCurrentStep(i);
          setStepProgress(Math.max(0, Math.min(1, (center - top) / height)));
          return;
        }
      }
      setCurrentStep(0);
      setStepProgress(0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Each step = exactly 1 year → linear time-per-scroll, no beat interpolation
  const fractionalYear = Math.min(40, currentStep + stepProgress);

  return (
    <div className="the-compound-story">
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
          <SnowballViz fractionalYear={fractionalYear} />
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
