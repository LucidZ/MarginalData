import { useRef, useState, useEffect } from 'react';
import * as d3 from 'd3';
import TaxViz from './TaxViz';
import { incomeFromProgress } from './data';
import './App.css';

const fmt$ = d3.format('$,.0f');

const STEPS = [
  {
    bracketPct: '10%',
    headline: 'Your first dollar',
    body: (
      <>
        <p>
          Every dollar you earn gets taxed — but not all dollars at the same rate.
          Your first $11,925 of income sits in the <strong>10% bracket</strong>.
        </p>
        <p>
          The knife above marks the cut: 90 cents stays with you (dark green),
          10 cents goes to taxes (light green). That split is fixed for every
          dollar you earn in this bracket.
        </p>
      </>
    ),
  },
  {
    bracketPct: '12%',
    headline: 'Crossing into 12%',
    body: (
      <>
        <p>
          The knife just shifted left. Once income exceeds $11,925, each new dollar
          is taxed at <strong>12%</strong> instead of 10%.
        </p>
        <p>
          Crucially, your first $11,925 still faces only 10%. Moving into a higher
          bracket does <em>not</em> retroactively raise the tax on money you already earned.
        </p>
      </>
    ),
  },
  {
    bracketPct: '22%',
    headline: 'A bigger jump: 22%',
    body: (
      <>
        <p>
          The knife moves noticeably left at $48,475. Dollars above this threshold
          are now taxed at <strong>22%</strong>.
        </p>
        <p>
          Watch the effective rate at the bottom — it's rising slowly despite the
          jump from 12% to 22% on new dollars. The bulk of income is still
          protected by the lower rates on earlier earnings.
        </p>
        <div className="effective-callout">
          Marginal rate = what your <em>next</em> dollar pays.<br />
          Effective rate = what you've paid <em>overall</em>.
        </div>
      </>
    ),
  },
  {
    bracketPct: '24%',
    headline: '24%: barely worse than 22%',
    body: (
      <>
        <p>
          The knife barely moves at $103,350. The jump from 22% to 24% is small —
          just 2 percentage points on new dollars.
        </p>
        <p>
          This is the myth: people fear a raise that "pushes them into a higher bracket."
          Only the dollars <em>above</em> the threshold get taxed at the new rate.
          A raise never makes you worse off overall.
        </p>
      </>
    ),
  },
  {
    bracketPct: '32%',
    headline: 'Even at 32%, the effective rate stays low',
    body: (
      <>
        <p>
          At $197,300 the marginal rate becomes <strong>32%</strong>. The knife shifts
          left more noticeably.
        </p>
        <p>
          But scroll down to the cumulative bar — the effective rate at $250k is around
          <strong> 24%</strong>, not 32%. The progressive structure shields every earlier
          dollar from the higher rate.
        </p>
        <div className="effective-callout">
          At {fmt$(250_525)} of income, roughly <strong>$60,000</strong> goes to federal taxes.
          The rest stays with you.
        </div>
      </>
    ),
  },
];

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [income, setIncome] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const totalScrollable = el.scrollHeight - window.innerHeight;
      const scrolled = -rect.top;
      const progress = Math.max(0, Math.min(1, scrolled / totalScrollable));
      setIncome(incomeFromProgress(progress));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="marginal-tax-story" ref={containerRef}>
      <header className="story-header">
        <h1>How Marginal Tax Rates Actually Work</h1>
        <p className="subtitle">
          Scroll to earn income. Watch the knife.
        </p>
      </header>

      <div className="scrolly-container">
        {/* Sticky viz */}
        <div className="scrolly-viz">
          <TaxViz income={income} />
        </div>

        {/* Scrollable text steps */}
        <div className="scrolly-steps">
          {STEPS.map((step) => (
            <div className="scrolly-step" key={step.bracketPct}>
              <div className="step-inner">
                <span className="bracket-label">{step.bracketPct}</span>
                <h2>{step.headline}</h2>
                {step.body}
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="story-sources">
        <strong>Source:</strong> IRS Rev. Proc. 2024-40 (Tax Year 2025, Single Filer).{' '}
        Standard deduction not applied — income shown is taxable income.{' '}
        State and local taxes not included.
      </footer>
    </div>
  );
}
