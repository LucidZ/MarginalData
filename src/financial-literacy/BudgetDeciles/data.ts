// BLS Table 1110 — Deciles of income before taxes, annual expenditure means
// Consumer Expenditure Surveys, 2024
// U.S. Bureau of Labor Statistics
// https://www.bls.gov/cex/tables/calendar-year/mean-shares-standard-error/cu-income-decile-before-taxes-2024.pdf

export interface Category {
  key: string;
  label: string;
  color: string;
}

// Stacking order: housing at bottom, savings at top (the key insight)
export const CATEGORIES: Category[] = [
  { key: 'housing',        label: 'Housing',             color: '#c4704a' },
  { key: 'transportation', label: 'Transportation',      color: '#4a7fb5' },
  { key: 'food',           label: 'Food & Drink',        color: '#d4952c' },
  { key: 'healthcare',     label: 'Healthcare',          color: '#6aadaa' },
  { key: 'other',          label: 'Everything else',     color: '#b0b0b0' },
  { key: 'savings',        label: 'Savings & Insurance', color: '#2d6a4f' },
];

export const DECILE_LABELS = [
  '1st', '2nd', '3rd', '4th', '5th',
  '6th', '7th', '8th', '9th', '10th',
];

// Mean income before taxes, by decile [D1..D10]
export const INCOME = [9612, 23805, 36188, 49681, 65170, 83760, 106439, 136502, 182587, 346942];

// Mean total annual expenditures, by decile
export const TOTAL_SPENDING = [31660, 38473, 46340, 53778, 62880, 70913, 81716, 98158, 121317, 179513];

// Annual mean spending by category and decile [D1..D10]
// "food" = BLS "Food" + "Alcoholic beverages"
// "savings" = BLS "Personal insurance and pensions" (includes retirement, life insurance, Social Security)
// "other" = Apparel, Entertainment, Education, Personal care, Reading, Tobacco, Misc, Cash contributions
// All six categories sum to TOTAL_SPENDING[di] for each decile.
export const SPENDING: Record<string, number[]> = {
  housing:        [13295, 15849, 18193, 20158, 22816, 25368, 28056, 30678, 35511, 52604],
  transportation: [ 4341,  5881,  7549,  9314, 11261, 12052, 13714, 18167, 21146, 29636],
  food:           [ 5560,  5925,  7197,  8287,  9080, 10123, 11707, 13434, 15612, 21150],
  healthcare:     [ 2755,  4145,  4568,  5085,  5281,  6071,  6916,  7574,  9072, 10476],
  other:          [ 5254,  5702,  6705,  7637,  9198, 10048, 11580, 14202, 20109, 30910],
  savings:        [  455,   971,  2128,  3297,  5244,  7251,  9743, 14103, 19867, 34737],
};
