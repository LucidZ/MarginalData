// Source: Federal Reserve 2024 SHED (Survey of Household Economics and Decisionmaking)
// https://www.federalreserve.gov/publications/2024-economic-well-being-of-us-households-in-2023-dealing-with-expenses.htm
// 37% of adults in 2023 reported they would NOT be able to cover a hypothetical $400
// emergency expense using cash or equivalent (checking/savings alone).
//
// Alex's budget: Stage 2 — First Job. Age 26, $54K/yr gross.
// Take-home: $3,650/mo. Baseline net: +$250/mo.
// Buffer starts at $0 (just moved into the apartment at the start of the year).
//
// Monthly nets are the baseline +$250 except in months with unexpected expenses.
// Cumulative buffer = running total of all monthly nets from January.

export interface MonthData {
  month: string;
  net: number;    // monthly net (income - expenses)
  buffer: number; // cumulative running total (the "cushion")
  event?: string; // label for unexpected expense months
}

export const ALEX_YEAR: MonthData[] = [
  { month: 'Jan', net:  250, buffer:  250 },
  { month: 'Feb', net:  250, buffer:  500 },
  { month: 'Mar', net: -550, buffer:  -50, event: 'Car repair ($800)' },
  { month: 'Apr', net:  250, buffer:  200 },
  { month: 'May', net:  250, buffer:  450 },
  { month: 'Jun', net:  250, buffer:  700 },
  { month: 'Jul', net: -350, buffer:  350, event: 'Dental work ($600)' },
  { month: 'Aug', net:  250, buffer:  600 },
  { month: 'Sep', net:  250, buffer:  850 },
  { month: 'Oct', net:  250, buffer: 1100 },
  { month: 'Nov', net: -750, buffer:  350, event: 'ER visit ($1,000 copay)' },
  { month: 'Dec', net:  250, buffer:  600 },
];

// The Fed's benchmark: adults who can cover $400 in cash without borrowing.
export const SHED_THRESHOLD = 400;
