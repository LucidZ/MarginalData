// Investment assumption: $300/month at 7% annual return (real, long-run S&P 500 average).
// Debt assumption: $5,000 credit card at 24% APR, no payments made.
//
// Source for 7% real return: Dimson, Marsh, Staunton, "Triumph of the Optimists" (2002);
// Vanguard long-run equity return assumptions (2024).
// Source for average CC APR: Federal Reserve G.19 release, 2024 (~21-27% for revolving credit).

const PMT = 300;
const ANNUAL_RATE = 0.07;
const MONTHLY_RATE = ANNUAL_RATE / 12;

function portfolioFV(months: number): number {
  if (months <= 0) return 0;
  return PMT * ((Math.pow(1 + MONTHLY_RATE, months) - 1) / MONTHLY_RATE);
}

export interface CompoundPoint {
  year: number;
  contributions: number;
  portfolio: number;
  gains: number;
}

// Alex: starts investing at 25, runs 40 years to 65
export const ALEX_DATA: CompoundPoint[] = Array.from({ length: 41 }, (_, yr) => {
  const portfolio = portfolioFV(yr * 12);
  const contributions = PMT * yr * 12;
  return { year: yr, contributions, portfolio, gains: portfolio - contributions };
});

// Jordan: same income, same $300/month, starts at 35 (10-year lag on Alex's timeline)
export const JORDAN_DATA: CompoundPoint[] = Array.from({ length: 41 }, (_, yr) => {
  const jordanMonths = Math.max(0, (yr - 10) * 12);
  const portfolio = portfolioFV(jordanMonths);
  const contributions = PMT * jordanMonths;
  return { year: yr, contributions, portfolio, gains: portfolio - contributions };
});

// Year at which Alex's gains first exceed her contributions (the "snowball tips")
export const CROSSOVER_YEAR =
  ALEX_DATA.find(d => d.gains >= d.contributions)?.year ?? 19;

export const ALEX_FINAL = Math.round(ALEX_DATA[40].portfolio);   // ~$788K
export const JORDAN_FINAL = Math.round(JORDAN_DATA[40].portfolio); // ~$366K

// ── Debt data ────────────────────────────────────────────────────────────────
// $5,000 CC balance at 24% APR, no payments — shown over 8 years to capture two doublings.
// Rule of 72: 72 / 24 = 3 years to double.

const DEBT_PRINCIPAL = 5_000;
const DEBT_MONTHLY_RATE = 0.24 / 12; // 2% per month

export interface DebtPoint {
  year: number;
  principal: number; // always -DEBT_PRINCIPAL (negative — owed)
  totalOwed: number; // negative, growing in magnitude
  interest: number;  // totalOwed − principal (negative)
}

export const DEBT_DATA: DebtPoint[] = Array.from({ length: 9 }, (_, yr) => {
  const totalOwed = -DEBT_PRINCIPAL * Math.pow(1 + DEBT_MONTHLY_RATE, yr * 12);
  return {
    year: yr,
    principal: -DEBT_PRINCIPAL,
    totalOwed,
    interest: totalOwed - (-DEBT_PRINCIPAL),
  };
});

export const DEBT_YEAR3 = Math.round(Math.abs(DEBT_DATA[3].totalOwed)); // ~$10,200
export const DEBT_YEAR6 = Math.round(Math.abs(DEBT_DATA[6].totalOwed)); // ~$20,800
