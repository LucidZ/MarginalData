import { useEffect, useRef, useState } from 'react';
import CushionViz from './CushionViz';
import { Sources } from '../shared/Sources';
import { SeriesNav } from '../shared/SeriesNav';
import './App.css';

// ── Scroll steps ──────────────────────────────────────────────────────────────
// revealedMonths: how many months the viz shows (1–12)
// showThreshold:  whether the $400 reference line is visible
const STEPS: {
  revealedMonths: number;
  showThreshold: boolean;
  headline: string;
  body: string;
}[] = [
  {
    revealedMonths: 1,
    showThreshold: false,
    headline: "Let's follow a year",
    body: "Alex is 26. Take-home $3,650/mo. Monthly net: +$250. January closes right on the baseline — $250 added to the account. It's a start.",
  },
  {
    revealedMonths: 2,
    showThreshold: false,
    headline: 'February adds another',
    body: "Clean month, no surprises. The buffer grows to $500. Two months of runway sitting in the account.",
  },
  {
    revealedMonths: 3,
    showThreshold: false,
    headline: 'Then March happened',
    body: "The car breaks down. Repair bill: $800. A month that should have added $250 instead took $550. The bar drops below zero — for the first time, the cushion is gone.",
  },
  {
    revealedMonths: 5,
    showThreshold: false,
    headline: 'Three months to dig out',
    body: "April and May are ordinary — back to the +$250 baseline. By the end of May the buffer is at $450. Two solid months to recover what one repair bill wiped out.",
  },
  {
    revealedMonths: 7,
    showThreshold: false,
    headline: 'Summer swings',
    body: "June pushes the buffer to $700 — the best position yet. Then July: dental work that couldn't be postponed. $600 bill. Buffer drops to $350.",
  },
  {
    revealedMonths: 10,
    showThreshold: false,
    headline: 'The fall run',
    body: "August, September, October — three clean months. The buffer climbs to $1,100. The best stretch of the year: no surprises, nothing breaks.",
  },
  {
    revealedMonths: 11,
    showThreshold: false,
    headline: 'November',
    body: "Chest pain at 2am. The ER. Turned out to be nothing serious. The copay and a missed shift: −$1,000. Buffer drops back to $350.",
  },
  {
    revealedMonths: 12,
    showThreshold: false,
    headline: 'December closes the year',
    body: "A normal month. Buffer ends at $600. A full year, end to end. Now let's add one reference point.",
  },
  {
    revealedMonths: 12,
    showThreshold: true,
    headline: 'The $400 threshold',
    body: "That line is $400 — the Federal Reserve's emergency benchmark. Alex spent five of twelve months below it. For 37% of American adults, that line never clears at all.",
  },
];

const SOURCES = [
  {
    org: 'Federal Reserve',
    title: '2024 Report on the Economic Well-Being of U.S. Households (SHED)',
    url: 'https://www.federalreserve.gov/publications/2024-economic-well-being-of-us-households-in-2023-dealing-with-expenses.htm',
    note: '37% of adults in 2023 reported they could not cover a $400 emergency using cash or checking/savings alone',
  },
  {
    org: 'U.S. Bureau of Labor Statistics',
    title: 'Consumer Expenditures — 2024',
    url: 'https://www.bls.gov/news.release/cesan.nr0.htm',
    note: "Alex's budget figures are grounded in BLS Q2 quintile averages for a single-person household",
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
      { threshold: 0.4 }
    );
    stepRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const step = STEPS[Math.min(currentStep, STEPS.length - 1)];

  return (
    <div className="the-cushion-story">
      <header className="story-header">
        <SeriesNav current={2} />
        <h1>The Cushion</h1>
        <p className="subtitle">
          Your monthly net tells you the direction. The cushion tells you how much room you have to absorb a hit.
        </p>
      </header>

      {/* ── SCROLLY SECTION ─────────────────────────────────────────── */}
      <div className="scrolly-container">
        <div className="scrolly-viz">
          <CushionViz
            revealedMonths={step.revealedMonths}
            showThreshold={step.showThreshold}
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

      {/* ── SOURCES ─────────────────────────────────────────────────── */}
      <div className="story-footer">
        <Sources sources={SOURCES} />
      </div>

      {/* ── NEXT STORY ──────────────────────────────────────────────── */}
      <div className="next-story-card">
        <p className="next-story-label">Next in the series</p>
        <h2 className="next-story-title">The Snowball</h2>
        <p className="next-story-body">
          The cushion tells you how much room you have when something breaks. The snowball shows
          what happens when you use that room consistently — and what it costs to wait ten years to start.
        </p>
        <a href="#/financial-literacy/the-compound" className="next-story-link">
          Continue →
        </a>
      </div>
    </div>
  );
}
