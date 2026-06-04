import { useEffect, useRef, useState } from 'react';
import SnowballViz from './SnowballViz';
import { Sources } from '../shared/Sources';
import { SeriesNav } from '../shared/SeriesNav';
import './App.css';

// ── Scroll beats ───────────────────────────────────────────────────────────────
const STEPS: { yearsToShow: number; headline: string; body: string }[] = [
  {
    yearsToShow: 1,
    headline: 'Year 1: $100, invested once',
    body: 'No future contributions. No active management. Just $100 put into a diversified index fund and left alone, earning 7% annually — the market\'s long-run average. By year\'s end: $107.',
  },
  {
    yearsToShow: 2,
    headline: 'Year 2: the first bit of gold',
    body: 'The $7 from year one stayed invested. Now it\'s earning too. The gold sliver — just $0.49 — is interest earned by interest. It\'s a rounding error today. It won\'t always be.',
  },
  {
    yearsToShow: 3,
    headline: 'Year 3: three layers',
    body: 'Green: your original $100. Light green: the simple interest your $100 has earned. Gold: the interest earned by that interest. The gold is tiny. But it grows faster than the other two — forever.',
  },
  {
    yearsToShow: 11,
    headline: 'Year 11: it doubled',
    body: 'Your $100 is now $210. The Rule of 72: divide 72 by your return rate and that\'s roughly how long doubling takes. At 7%, about 10 years. The gold layer is getting hard to miss.',
  },
  {
    yearsToShow: 20,
    headline: 'Year 20: gold crosses green',
    body: 'Your $100 is now $387. The compound bonus — gold — is $147. It\'s now larger than your original $100 investment. Interest on interest is outearning your entire starting amount.',
  },
  {
    yearsToShow: 30,
    headline: 'Year 30: the snowball has mass',
    body: 'Your $100 is now $761. In year 30 alone, it earned $50 — half of what you started with. The gold is now the majority of what you have. And the base keeps growing, so next year\'s interest will be larger still.',
  },
  {
    yearsToShow: 40,
    headline: 'Year 40: your money earns itself back',
    body: 'Your $100 is now $1,497. This year it earned $98 — nearly what you started with 40 years ago. You\'ve made $1,397 on a single $100 investment you never touched. That\'s compounding.',
  },
];

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
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

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
      { threshold: 0.4 },
    );
    stepRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const step = STEPS[Math.min(currentStep, STEPS.length - 1)];

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
          <SnowballViz yearsToShow={step.yearsToShow} />
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

      <div className="story-footer">
        <Sources sources={SOURCES} />
      </div>
    </div>
  );
}
