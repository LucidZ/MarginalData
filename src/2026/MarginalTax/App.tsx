import { useRef, useState, useEffect } from 'react';
import * as d3 from 'd3';
import TaxViz from './TaxViz';
import { incomeFromProgress } from './data';
import './App.css';

const fmt$ = d3.format('$,.0f');

const STEPS: { bracketPct?: string; headline: string; body: React.ReactNode }[] = [
  {
    bracketPct: '10%',
    headline: 'Your first dollars',
    body: (
      <>
        <p>
          Every dollar you earn gets taxed — but not all dollars at the same rate.
          Your first $12,400 of income sits in the <strong>10% bracket</strong>.
        </p>
        <p>
          Let's look at every $100 of income in sequence. The triangular divider 
          marks the split: 90 cents stays with you (dark green), 10 cents goes 
          to taxes (light green). That split is fixed for every ollar you earn 
          in this bracket.
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
          The marginal taxes just increased. Once income exceeds $12,400, each new dollar
          is taxed at <strong>12%</strong> instead of 10%.
        </p>
        <p>
          Crucially, your first $12,400 still faces only 10%. Moving into a higher
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
          An even bigger tax increase occurs at $50,400. Dollars above this threshold
          are now taxed at <strong>22%</strong>.
        </p>
        <p>
          Watch the effective rate below — it's rising slowly despite the
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
          At $105,700, the jump from 22% to 24% is small —
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
          At $201,775 the marginal rate becomes <strong>32%</strong>. The divider shifts
          left more noticeably.
        </p>
        <p>
          But the effective rate is still below <strong>23%</strong> at the top of
          this bracket. The progressive structure shields every earlier dollar from
          the higher rate.
        </p>
      </>
    ),
  },
  {
    bracketPct: '35%',
    headline: 'Into the 35% bracket',
    body: (
      <>
        <p>
          At $256,225 the divider shifts to <strong>35%</strong>. More than a third of
          each new dollar goes to tax.
        </p>
        <p>
          This bracket spans a wide range — from $256k all the way to $640k. Despite
          the high marginal rate, the effective rate stays well behind. The first
          $256k is still sheltered by everything below.
        </p>
      </>
    ),
  },
  {
    headline: 'The gap that matters',
    body: (
      <>
        <p>
          At $640,600 — where the top bracket begins — the marginal rate is 37%,
          but the effective rate is still around <strong>30%</strong>. Seven-in-ten dollars
          came home with you.
        </p>
        <p>
          And to get here? You'd need to earn more than{' '}
          <strong>99% of Americans make in a year</strong>. The brackets people
          worry about are ones most will never reach.
        </p>
        <div className="effective-callout">
          Additonally, the tax picture at this income bracket is fuzzied by deductions, 
          credits, and capital gains rates widen the gap further — the average effective 
          federal rate for top earners is closer to <strong>26%</strong>, not 37%.{' '}
          That's a topic for another day.{' '}
          <a
            href="https://taxfoundation.org/data/all/federal/latest-federal-income-tax-data-2025/"
            target="_blank"
            rel="noopener noreferrer"
          >
            [Source]
          </a>
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
      <div className="rotate-prompt" aria-hidden="true">
        <span className="rotate-prompt__icon">&#8635;</span>
        <p className="rotate-prompt__text">Rotate your phone to portrait for the best experience.</p>
      </div>
      <header className="story-header">
        <h1>How Marginal Tax Rates Actually Work</h1>
        <p className="story-intro">
          About half of Americans mistakenly believe that crossing into a higher
          tax bracket raises their taxes on all their income.{' '}
          This myth can cause some people to turn down hard-earned raises for
          fear of owing higher taxes.{' '}
          Below is a visual explanation of how marginal taxes really work.{' '}
          <a
            href="https://www.aei.org/economics/survey-confirms-that-many-americans-misunderstand-income-tax-brackets/"
            target="_blank"
            rel="noopener noreferrer"
          >
            [Source]
          </a>
        </p>
        <p className="subtitle">Scroll to earn income.</p>
      </header>

      <div className="scrolly-container">
        {/* Sticky viz */}
        <div className="scrolly-viz">
          <TaxViz income={income} />
        </div>

        {/* Scrollable text steps */}
        <div className="scrolly-steps">
          {STEPS.map((step, i) => (
            <div className="scrolly-step" key={i} data-step={i}>
              <div className="step-inner">
                {step.bracketPct && <span className="bracket-label">{step.bracketPct}</span>}
                <h2>{step.headline}</h2>
                {step.body}
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="story-sources">
        <strong>Source:</strong> IRS tax inflation adjustments for tax year 2026 (Single Filer).{' '}
        Standard deduction not applied — income shown is taxable income.{' '}
        State and local taxes not included.
      </footer>
    </div>
  );
}
