// Alex's budget at three life stages — grounded in BLS Consumer Expenditure Survey 2024
// and the 2022 Survey of Consumer Finances (Federal Reserve, DOI: https://doi.org/10.17016/8799)
//
// BLS CEX 2024 income quintile thresholds:
//   Q1 < $29,932 | Q2 $29,932–57,452 | Q3 $57,452–94,511
//   Q4 $94,511–155,925 | Q5 > $155,925
//
// SCF 2022 savings findings (used as reveal stats in the narrative):
//   ~47% of U.S. families reported saving no money in 2022
//   16% of families earning $216K+ reported saving no money in 2022
//
// Tax estimates use 2024 brackets (IRS Rev. Proc. 2024-40):
//   Stage 1 ($18K, single): mostly FICA; minimal income tax after standard deduction
//   Stage 2 ($54K, single): ~19% effective (fed $375 + FICA $344 + state $131)
//   Stage 3 ($102K, MFJ couple): ~21% effective (fed $806 + FICA $650 + state $344)
//
// Budget line items are BLS-grounded approximations for illustrative purposes.

export type CategoryType = 'taxes' | 'fixed' | 'variable' | 'discretionary';
export type SegKey = CategoryType | 'net';
export type HighlightType = 'all' | CategoryType | 'net';

export interface BudgetItem {
  label: string;
  amount: number; // monthly dollars
  type: CategoryType;
}

export interface Archetype {
  id: string;
  name: string;
  description: string;
  quintileNote: string;
  grossMonthly: number;
  taxesMonthly: number;
  items: BudgetItem[];
}

export function takeHome(a: Archetype): number {
  return a.grossMonthly - a.taxesMonthly;
}

export function subtotalByType(a: Archetype, type: CategoryType): number {
  return a.items.filter(item => item.type === type).reduce((s, i) => s + i.amount, 0);
}

export function totalSpend(a: Archetype): number {
  return a.items.reduce((s, i) => s + i.amount, 0);
}

export function netMonthly(a: Archetype): number {
  return takeHome(a) - totalSpend(a);
}

// ── Stage 1: Student ──────────────────────────────────────────────────────────
// Alex, 22. Part-time barista while finishing school. $18K/yr gross.
// FICA $115/mo + minimal income tax $20/mo + small state $15/mo = $150/mo taxes.
// Rent split with roommates, no car. Monthly gap: -$200.
// Shortfall covered by student loans, parents, or credit card creep.
const STUDENT: Archetype = {
  id: 'student',
  name: 'Student',
  description: 'Alex · age 22 · part-time · $18K/yr',
  quintileNote: 'Income quintile 1 (under $29,932). Tax estimate: mostly FICA on $1,500/mo gross; federal income tax near zero after standard deduction.',
  grossMonthly: 1_500,
  taxesMonthly: 150,
  items: [
    // fixed
    { label: 'Rent — split 3 ways',           amount: 650, type: 'fixed' },
    { label: 'Phone plan, autopay',            amount:  50, type: 'fixed' },
    { label: 'Netflix + Spotify, autopay',     amount:  20, type: 'fixed' },
    // variable — original groceries $270 + transport $80 = $350
    { label: 'Trader Joe\'s, ~2× a week',      amount: 160, type: 'variable' },
    { label: 'Corner store + CVS runs',        amount: 110, type: 'variable' },
    { label: 'Metro card + a few Ubers',       amount:  80, type: 'variable' },
    // discretionary — original dining+social $310 + clothing+misc $170 = $480
    { label: 'Morning coffee, most days',      amount:  60, type: 'discretionary' },
    { label: 'Lunch delivery, few times',      amount:  80, type: 'discretionary' },
    { label: 'Friday dinner + one bar tab',    amount: 170, type: 'discretionary' },
    { label: 'New jeans + a hoodie',           amount:  90, type: 'discretionary' },
    { label: 'Shampoo, razors, one Amazon',    amount:  80, type: 'discretionary' },
  ],
};
// Net check: takeHome = 1,500 - 150 = 1,350. totalSpend = 1,550. net = -200. ✓
// Money runs out during "Dinner & going out": $140 income left, $170 cost → $30 on card.
// Remaining debt: clothing $90 + toiletries $80 = $170 + $30 = $200 total. ✓

// ── Stage 2: First Job ────────────────────────────────────────────────────────
// Alex, 26. Entry-level analyst, first real salary. $54K/yr gross.
// Fed $375/mo + FICA $344/mo + state $131/mo = $850/mo taxes (~19% effective).
// Renting solo, bought a used car. Monthly gap: +$250 (~6.8% of take-home).
// Slightly above the national personal savings rate — but not by much.
const FIRST_JOB: Archetype = {
  id: 'first-job',
  name: 'First Job',
  description: 'Alex · age 26 · analyst · $54K/yr',
  quintileNote: 'Income quintile 2 ($29,932–$57,452). BLS avg annual expenditures for Q2: $55,267. Tax estimate: single filer, 2024 brackets.',
  grossMonthly: 4_500,
  taxesMonthly: 850,
  items: [
    { label: 'Rent (1BR)',              amount: 1_500, type: 'fixed' },
    { label: 'Car payment + insurance', amount:   350, type: 'fixed' },
    { label: 'Phone',                   amount:    60, type: 'fixed' },
    { label: 'Healthcare (basic plan)', amount:   120, type: 'fixed' },
    { label: 'Subscriptions',           amount:    50, type: 'fixed' },
    { label: 'Groceries',               amount:   300, type: 'variable' },
    { label: 'Gas',                     amount:    90, type: 'variable' },
    { label: 'Dining + social',         amount:   500, type: 'discretionary' },
    { label: 'Entertainment',           amount:   200, type: 'discretionary' },
    { label: 'Clothing + misc',         amount:   230, type: 'discretionary' },
  ],
};
// Net check: takeHome = 4,500 - 850 = 3,650. totalSpend = 3,400. net = +250. ✓

// ── Stage 3: Established ──────────────────────────────────────────────────────
// Alex, 34. Bought a house, two incomes, $102K/yr combined gross.
// MFJ: fed $806/mo + FICA $650/mo + state $344/mo = $1,800/mo taxes (~21% effective).
// Income nearly doubled since the first job — but so did spending. Monthly gap: +$250 (~3.7% of take-home).
// Same dollar gap as stage 2 despite income growing by $4,000/mo. Lifestyle absorbed every raise.
const ESTABLISHED: Archetype = {
  id: 'established',
  name: 'Established',
  description: 'Alex · age 34 · homeowners · $102K/yr',
  quintileNote: 'Income quintile 3–4 ($57K–$155K). BLS avg annual expenditures for Q3: $74,547; Q4: $100,523. Tax estimate: married filing jointly, 2024 brackets.',
  grossMonthly: 8_500,
  taxesMonthly: 1_800,
  items: [
    { label: 'Mortgage + tax + insurance', amount: 2_200, type: 'fixed' },
    { label: 'Two cars',                   amount:   750, type: 'fixed' },
    { label: 'Healthcare (family plan)',   amount:   350, type: 'fixed' },
    { label: 'Subscriptions',             amount:   120, type: 'fixed' },
    { label: 'Groceries',                 amount:   600, type: 'variable' },
    { label: 'Gas',                       amount:   120, type: 'variable' },
    { label: 'Utilities',                 amount:   300, type: 'variable' },
    { label: 'Dining + entertainment',    amount: 1_100, type: 'discretionary' },
    { label: 'Travel + hobbies',          amount:   650, type: 'discretionary' },
    { label: 'Clothing + misc',           amount:   260, type: 'discretionary' },
  ],
};
// Net check: takeHome = 8,500 - 1,800 = 6,700. totalSpend = 6,450. net = +250. ✓

export const ARCHETYPES: Archetype[] = [
  STUDENT,
  FIRST_JOB,
  ESTABLISHED,
];

// The stage used in the scrollytelling walkthrough.
// Established has 11 display items (taxes + 10 budget items) — same count as the
// previous Median Family, so VIZ_MAP step counts remain valid during story rewrite.
export const SCROLLY_ARCHETYPE_IDX = 2; // Established
