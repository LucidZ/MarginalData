import { useEffect, useRef, useState } from 'react';
import CompoundViz, { VizMode } from './CompoundViz';
import { Sources } from '../shared/Sources';
import { SeriesNav } from '../shared/SeriesNav';
import { CROSSOVER_YEAR, ALEX_FINAL, JORDAN_FINAL, DEBT_YEAR3, DEBT_YEAR6 } from './data';
import './App.css';

const alexFinalK = Math.round(ALEX_FINAL / 1000);
const jordanFinalK = Math.round(JORDAN_FINAL / 1000);
const gapK = Math.round((ALEX_FINAL - JORDAN_FINAL) / 1000);

const STEPS: { mode: VizMode; headline: string; body: string }[] = [
  {
    mode: 'line',
    headline: "A line you've seen before",
    body: `Alex is 25. She puts $300/month into a diversified index fund — consistent, boring, nothing fancy. Assuming the market's long-run 7% real annual return, this is what her portfolio looks like by 65.`,
  },
  {
    mode: 'areas',
    headline: 'Two layers inside that line',
    body: `The green is what Alex actually contributed — $300 a month, every month. The gold is what the money earned on its own. Both grow, but they don't stay equal.`,
  },
  {
    mode: 'crossover',
    headline: 'The balance tips',
    body: `Around year ${CROSSOVER_YEAR}, something shifts. From that point on, Alex's portfolio earns more in a single year than she puts in. The money is working harder than she is.`,
  },
  {
    mode: 'debt',
    headline: 'The same math, the other direction',
    body: `$5,000 on a credit card at 24% APR. No new purchases — just the original balance, left alone. By year 3, it's $${Math.round(DEBT_YEAR3 / 100) * 100 > 10000 ? (DEBT_YEAR3 / 1000).toFixed(1) + 'K' : DEBT_YEAR3.toLocaleString()}. By year 6, $${(DEBT_YEAR6 / 1000).toFixed(1)}K. The same exponential curve — pointed down.`,
  },
  {
    mode: 'two-paths',
    headline: 'Same income. Ten years apart.',
    body: `Meet Jordan. Same job, same salary, same $300/month. Jordan just started at 35 instead of 25. Both invest until 65. Watch what opens between them.`,
  },
  {
    mode: 'gap',
    headline: 'A $${gapK}K gap from a 10-year head start',
    body: `Alex ends with $${alexFinalK}K. Jordan ends with $${jordanFinalK}K. The difference is $${gapK}K — and most of it isn't from the extra contributions. It's from the compounding that had 10 more years to run.`,
  },
];

// Replace template literal in last step headline
STEPS[5].headline = `A $${gapK}K gap from a 10-year head start`;

const SOURCES = [
  {
    org: 'Vanguard',
    title: 'Vanguard economic and market outlook 2024',
    url: 'https://institutional.vanguard.com/insights/article/economic-market-outlook-2024',
    note: '7% nominal (real ~4–5%) used as long-run equity return assumption; this model uses 7% real for illustrative clarity',
  },
  {
    org: 'Federal Reserve',
    title: 'Consumer Credit — G.19 Release, 2024',
    url: 'https://www.federalreserve.gov/releases/g19/',
    note: 'Average interest rate on revolving credit plans: 21–27% APR; 24% used as a representative mid-range',
  },
];

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
      { threshold: 0.4 }
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
          Compound interest is simple — returns earn returns. The part people miss is how quickly
          the math tips from working against you to working for you.
        </p>
      </header>

      <div className="scrolly-container">
        <div className="scrolly-viz">
          <CompoundViz mode={step.mode} />
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
