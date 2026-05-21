// Archetype budgets grounded in BLS Consumer Expenditure Survey 2024
// Source: https://www.bls.gov/news.release/cesan.nr0.htm
//
// 2024 income quintile thresholds:
//   Q1 < $29,932 | Q2 $29,932–57,452 | Q3 $57,452–94,511
//   Q4 $94,511–155,925 | Q5 > $155,925
//
// Average annual expenditures by quintile:
//   Q1 $35,046 | Q2 $55,267 | Q3 $74,547 | Q4 $100,523 | Q5 $150,342
//
// Overall: avg income $104,207, avg expenditures $78,535
// Housing as % of spending: Q1 41.6%, all 33.4%, Q5 29.3%
//
// Individual archetype line items are BLS-grounded approximations.
// Single-person and family figures differ from quintile averages, which
// pool many household compositions.

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

// ── Archetype 1: Getting By ───────────────────────────────────────────────────
// Single renter, $38K/yr gross (Q2). Annual spending ~$29.5K.
// Fed ~$215/mo + FICA ~$242/mo + state ~$95/mo = $552/mo taxes (17.4% effective).
// Net: $160/mo — one unexpected bill erases it.
const GETTING_BY: Archetype = {
  id: 'getting-by',
  name: 'Getting By',
  description: 'Single · renter · $38K/yr',
  quintileNote: 'Income quintile 2 ($30K–$57K). BLS avg annual expenditures for Q2: $55,267.',
  grossMonthly: 3_167,
  taxesMonthly: 552,
  items: [
    { label: 'Rent', amount: 1_100, type: 'fixed' },
    { label: 'Car payment + insurance', amount: 330, type: 'fixed' },
    { label: 'Phone + utilities', amount: 150, type: 'fixed' },
    { label: 'Healthcare (HDHP)', amount: 150, type: 'fixed' },
    { label: 'Subscriptions', amount: 45, type: 'fixed' },
    { label: 'Groceries', amount: 280, type: 'variable' },
    { label: 'Gas', amount: 100, type: 'variable' },
    { label: 'Dining + entertainment', amount: 160, type: 'discretionary' },
    { label: 'Clothing + misc', amount: 140, type: 'discretionary' },
  ],
};

// ── Archetype 2: Median Family ────────────────────────────────────────────────
// Couple + child, $78K combined gross (Q3 median). Homeowner.
// MFJ standard deduction lowers federal burden; FICA on two earners.
// Fed ~$453/mo + FICA ~$497/mo + state ~$325/mo ≈ $1,300/mo (20% effective).
// Net: $45/mo — the "invisible net" at the median.
const MEDIAN_FAMILY: Archetype = {
  id: 'median-family',
  name: 'Median Family',
  description: 'Couple + child · homeowner · $78K/yr',
  quintileNote: 'Income quintile 3 ($57K–$95K). BLS avg annual expenditures for Q3: $74,547.',
  grossMonthly: 6_500,
  taxesMonthly: 1_300,
  items: [
    { label: 'Mortgage + property tax + insurance', amount: 2_100, type: 'fixed' },
    { label: 'Two cars', amount: 700, type: 'fixed' },
    { label: 'Healthcare (family plan)', amount: 420, type: 'fixed' },
    { label: 'Childcare', amount: 500, type: 'fixed' },
    { label: 'Subscriptions', amount: 75, type: 'fixed' },
    { label: 'Groceries', amount: 580, type: 'variable' },
    { label: 'Gas', amount: 180, type: 'variable' },
    { label: 'Utilities', amount: 200, type: 'variable' },
    { label: 'Dining + entertainment', amount: 280, type: 'discretionary' },
    { label: 'Clothing + misc', amount: 120, type: 'discretionary' },
  ],
};

// ── Archetype 3: Comfortable ──────────────────────────────────────────────────
// Dual income, no kids (DINK), $130K combined gross (Q4). Homeowner.
// Higher marginal rates; no dependent deductions.
// Fed ~$1,223/mo + FICA ~$829/mo + state ~$542/mo ≈ $2,833/mo (26% effective).
// Net: $1,400/mo — clearly positive, but lifestyle creep is invisible.
const COMFORTABLE: Archetype = {
  id: 'comfortable',
  name: 'Comfortable',
  description: 'Dual income, no kids · homeowner · $130K/yr',
  quintileNote: 'Income quintile 4 ($95K–$156K). BLS avg annual expenditures for Q4: $100,523.',
  grossMonthly: 10_833,
  taxesMonthly: 2_833,
  items: [
    { label: 'Mortgage + property tax + insurance', amount: 2_700, type: 'fixed' },
    { label: 'Two cars', amount: 900, type: 'fixed' },
    { label: 'Healthcare', amount: 300, type: 'fixed' },
    { label: 'Subscriptions', amount: 150, type: 'fixed' },
    { label: 'Groceries', amount: 700, type: 'variable' },
    { label: 'Gas + utilities', amount: 370, type: 'variable' },
    { label: 'Dining + bars', amount: 700, type: 'discretionary' },
    { label: 'Travel + hobbies', amount: 500, type: 'discretionary' },
    { label: 'Shopping + misc', amount: 280, type: 'discretionary' },
  ],
};

// ── Archetype 4: HCOL Trap ────────────────────────────────────────────────────
// Single, $90K/yr gross in San Francisco (Q3/Q4 income, Q1 net outcome).
// CA state income tax ~9% effective; combined burden 28%.
// Fed ~$969/mo + FICA ~$574/mo + CA state ~$540/mo ≈ $2,100/mo (28% effective).
// Rent alone is 52% of take-home. Net: $30/mo — same income band as Q3,
// radically worse outcome due to geography and student debt.
const HCOL_TRAP: Archetype = {
  id: 'hcol-trap',
  name: 'HCOL Trap',
  description: 'Single · San Francisco renter · $90K/yr',
  quintileNote: 'Q3/Q4 income nationally, but rent + student debt produce a Q1 net.',
  grossMonthly: 7_500,
  taxesMonthly: 2_100,
  items: [
    { label: 'Rent (SF 1BR)', amount: 2_800, type: 'fixed' },
    { label: 'Student loans', amount: 500, type: 'fixed' },
    { label: 'Healthcare', amount: 250, type: 'fixed' },
    { label: 'Subscriptions', amount: 80, type: 'fixed' },
    { label: 'Transit + rideshare', amount: 200, type: 'variable' },
    { label: 'Groceries', amount: 500, type: 'variable' },
    { label: 'Utilities', amount: 120, type: 'variable' },
    { label: 'Dining + social', amount: 500, type: 'discretionary' },
    { label: 'Entertainment + travel', amount: 300, type: 'discretionary' },
    { label: 'Clothing + misc', amount: 120, type: 'discretionary' },
  ],
};

export const ARCHETYPES: Archetype[] = [
  GETTING_BY,
  MEDIAN_FAMILY,
  COMFORTABLE,
  HCOL_TRAP,
];

// The archetype used in the scrollytelling walkthrough
export const SCROLLY_ARCHETYPE_IDX = 1; // Median Family
