import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as d3 from 'd3';
import './Calculator.css';

const fmt$ = d3.format('$,.0f');

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));
}

interface PayoffResult {
  balances: number[];
  months: number;
  totalPaid: number;
  totalInterest: number;
}

function computeFixed(balance: number, apr: number, payment: number): PayoffResult | null {
  const rate = apr / 100 / 12;
  if (payment <= balance * rate) return null;
  let bal = balance;
  let totalPaid = 0;
  let totalInterest = 0;
  const balances = [bal];
  while (bal > 0.005 && balances.length <= 601) {
    const interest = bal * rate;
    const pmt = Math.min(payment, bal + interest);
    totalPaid += pmt;
    totalInterest += interest;
    bal = Math.max(0, bal + interest - pmt);
    if (bal < 0.005) bal = 0;
    balances.push(bal);
  }
  return { balances, months: balances.length - 1, totalPaid, totalInterest };
}

function computeMin(balance: number, apr: number): PayoffResult {
  const rate = apr / 100 / 12;
  let bal = balance;
  let totalPaid = 0;
  let totalInterest = 0;
  const balances = [bal];
  while (bal > 0.005 && balances.length <= 601) {
    const interest = bal * rate;
    const pmt = Math.min(Math.max(0.01 * bal + interest, 25), bal + interest);
    totalPaid += pmt;
    totalInterest += interest;
    bal = Math.max(0, bal + interest - pmt);
    if (bal < 0.005) bal = 0;
    balances.push(bal);
  }
  return { balances, months: balances.length - 1, totalPaid, totalInterest };
}

function fmtMonths(months: number): string {
  if (months <= 0) return '< 1 mo';
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${months} mo`;
  if (m === 0) return `${y} yr`;
  return `${y} yr ${m} mo`;
}

// ── Chart ─────────────────────────────────────────────────────────────────────
const VW = 560;
const VH = 260;
const M = { top: 16, right: 20, bottom: 44, left: 68 };
const CW = VW - M.left - M.right;
const CH = VH - M.top - M.bottom;
const GREEN = '#1a7a4a';
const MUTED = '#999';

function PayoffChart({
  user,
  min,
  balance,
}: {
  user: PayoffResult;
  min: PayoffResult;
  balance: number;
}) {
  const showComparison = Math.abs(user.months - min.months) > 2;
  const maxMonths = showComparison
    ? Math.max(user.months, min.months)
    : user.months;

  const xScale = d3.scaleLinear().domain([0, maxMonths]).range([0, CW]);
  const yScale = d3.scaleLinear().domain([0, balance]).range([CH, 0]);

  const lineGen = d3.line<number>()
    .x((_, i) => xScale(i))
    .y(b => yScale(b));

  const areaGen = d3.area<number>()
    .x((_, i) => xScale(i))
    .y0(CH)
    .y1(b => yScale(b));

  // x-axis tick months
  const xTicks: number[] = [0];
  const step = maxMonths <= 24 ? 6 : maxMonths <= 84 ? 12 : 24;
  for (let m = step; m <= maxMonths; m += step) xTicks.push(m);

  // y-axis ticks
  const yTicks = [balance / 4, balance / 2, (balance * 3) / 4, balance].map(
    Math.round,
  );

  const anchorFor = (month: number) =>
    xScale(month) > CW * 0.8 ? 'end' : 'middle';

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <g transform={`translate(${M.left},${M.top})`}>
        {/* Zero line */}
        <line x1={0} y1={CH} x2={CW} y2={CH} stroke="#555" strokeWidth={1.5} />

        {/* Y-axis grid + labels */}
        {yTicks.map(tick => (
          <g key={tick}>
            <line
              x1={0} y1={yScale(tick)} x2={CW} y2={yScale(tick)}
              stroke="#eee" strokeWidth={1}
            />
            <text
              x={-10} y={yScale(tick)} dy="0.35em"
              textAnchor="end" fontSize={10} fill={MUTED} fontFamily="inherit"
            >
              {fmt$(tick)}
            </text>
          </g>
        ))}

        {/* Minimum payment reference line */}
        {showComparison && (
          <path
            d={lineGen(min.balances) ?? ''}
            fill="none" stroke="#ccc" strokeWidth={1.5} strokeDasharray="4 3"
          />
        )}

        {/* User scenario area + line */}
        <path d={areaGen(user.balances) ?? ''} fill={`${GREEN}14`} />
        <path
          d={lineGen(user.balances) ?? ''}
          fill="none" stroke={GREEN} strokeWidth={2}
        />

        {/* Payoff dots */}
        <circle cx={xScale(user.months)} cy={CH} r={4} fill={GREEN} />
        {showComparison && (
          <circle cx={xScale(min.months)} cy={CH} r={3} fill="#ccc" />
        )}

        {/* X-axis ticks + year labels */}
        {xTicks.map(m => (
          <g key={m}>
            <line x1={xScale(m)} y1={CH} x2={xScale(m)} y2={CH + 4} stroke="#aaa" />
            <text
              x={xScale(m)} y={CH + 15}
              textAnchor="middle" fontSize={9} fill={MUTED} fontFamily="inherit"
            >
              {m === 0 ? 'day 1' : step === 6 ? `${m} mo` : `yr ${m / 12}`}
            </text>
          </g>
        ))}

        {/* Payoff labels (row below year labels) */}
        <text
          x={xScale(user.months)} y={CH + 31}
          textAnchor={anchorFor(user.months)}
          fontSize={9} fontWeight={600} fill={GREEN} fontFamily="inherit"
        >
          {fmtMonths(user.months)}
        </text>
        {showComparison && (
          <text
            x={xScale(min.months)} y={CH + 31}
            textAnchor={anchorFor(min.months)}
            fontSize={9} fill={MUTED} fontFamily="inherit"
          >
            min: {fmtMonths(min.months)}
          </text>
        )}
      </g>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Calculator() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [copied, setCopied] = useState(false);

  const balance = clamp(Number(searchParams.get('balance') ?? '1000'), 100, 20000);
  const rate    = clamp(Number(searchParams.get('rate')    ?? '24'),   1,   50);
  const payment = clamp(Number(searchParams.get('payment') ?? '30'),   10, 2000);

  const set = (key: string, val: number) =>
    setSearchParams(
      p => { const n = new URLSearchParams(p); n.set(key, String(val)); return n; },
      { replace: true },
    );

  const monthlyInterest = (balance * rate) / 100 / 12;
  const canPayOff = payment > monthlyInterest + 0.005;

  const userResult = useMemo(
    () => (canPayOff ? computeFixed(balance, rate, payment) : null),
    [balance, rate, payment, canPayOff],
  );
  const minResult = useMemo(() => computeMin(balance, rate), [balance, rate]);

  const initMinPmt = Math.max(0.01 * balance + monthlyInterest, 25);

  const savings =
    userResult && userResult.months < minResult.months
      ? {
          months: minResult.months - userResult.months,
          dollars: minResult.totalPaid - userResult.totalPaid,
        }
      : null;

  const slower =
    userResult && userResult.months > minResult.months + 2
      ? {
          months: userResult.months - minResult.months,
          dollars: userResult.totalPaid - minResult.totalPaid,
        }
      : null;

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const controls = [
    {
      id: 'balance',
      label: 'Starting balance',
      display: fmt$(balance),
      value: balance,
      min: 100,
      max: 15000,
      step: 100,
    },
    {
      id: 'rate',
      label: 'Interest rate (APR)',
      display: `${rate}%`,
      value: rate,
      min: 5,
      max: 40,
      step: 0.5,
    },
    {
      id: 'payment',
      label: 'Monthly payment',
      display: `${fmt$(payment)}/mo`,
      value: payment,
      min: 10,
      max: 2000,
      step: 5,
    },
  ];

  return (
    <div className="debt-calc">
      <header className="debt-calc-header">
        <Link to="/financial-literacy/compound-debt" className="calc-back">
          ← Back to story
        </Link>
        <p className="calc-series-label">Financial Literacy</p>
        <h1>Your numbers</h1>
        <p className="calc-subtitle">
          Drag the sliders to see how interest rate and payment size change your payoff.
        </p>
      </header>

      <div className="calc-controls">
        {controls.map(({ id, label, display, value, min, max, step }) => (
          <div key={id} className="calc-control">
            <div className="control-row">
              <label htmlFor={`sl-${id}`}>{label}</label>
              <span className="control-value">{display}</span>
            </div>
            <input
              id={`sl-${id}`}
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={e => set(id, Number(e.target.value))}
            />
          </div>
        ))}
      </div>

      {!canPayOff ? (
        <div className="calc-warning">
          At {rate}% APR, this balance accrues {fmt$(monthlyInterest)}/mo in interest —
          your payment doesn't cover it. Raise the monthly payment above{' '}
          {fmt$(Math.ceil(monthlyInterest + 1))}/mo to start paying it down.
        </div>
      ) : userResult ? (
        <>
          <div className="calc-stats">
            <div className="calc-stat">
              <div className="stat-label">Paid off in</div>
              <div className="stat-value">{fmtMonths(userResult.months)}</div>
            </div>
            <div className="calc-stat">
              <div className="stat-label">Total paid</div>
              <div className="stat-value">{fmt$(userResult.totalPaid)}</div>
            </div>
            <div className="calc-stat">
              <div className="stat-label">Interest paid</div>
              <div className="stat-value">{fmt$(userResult.totalInterest)}</div>
            </div>
          </div>

          <div className="calc-chart">
            <PayoffChart user={userResult} min={minResult} balance={balance} />
            {Math.abs(userResult.months - minResult.months) > 2 && (
              <p className="chart-legend">
                <span className="legend-swatch legend-swatch--solid" />
                Your payment
                &nbsp;&nbsp;
                <span className="legend-swatch legend-swatch--dashed" />
                Minimum payment
              </p>
            )}
          </div>

          {savings && savings.dollars > 5 && (
            <div className="calc-insight">
              Paying {fmt$(payment)}/mo instead of the minimum saves{' '}
              <strong>{fmtMonths(savings.months)}</strong> and{' '}
              <strong>{fmt$(savings.dollars)}</strong> in total payments.
            </div>
          )}

          {slower && (
            <div className="calc-insight calc-insight--warn">
              The minimum payment on this balance starts at{' '}
              {fmt$(Math.ceil(initMinPmt))}/mo. Paying less takes{' '}
              {fmtMonths(slower.months)} longer and costs {fmt$(slower.dollars)} more.
            </div>
          )}
        </>
      ) : null}

      <div className="calc-share">
        <button className="share-btn" onClick={handleShare}>
          {copied ? '✓ Copied' : 'Share these numbers'}
        </button>
      </div>
    </div>
  );
}
