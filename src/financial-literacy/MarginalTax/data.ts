// 2025 US Federal Income Tax Brackets — Single Filer (Tax Year 2025)
// Source: IRS Rev. Proc. 2024-40
// https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2025

export interface Bracket {
  min: number;
  max: number | null;
  rate: number;
  label: string;
}

export const BRACKETS: Bracket[] = [
  { min:       0, max:    11_925, rate: 0.10, label: '10%' },
  { min:  11_925, max:    48_475, rate: 0.12, label: '12%' },
  { min:  48_475, max:   103_350, rate: 0.22, label: '22%' },
  { min: 103_350, max:   197_300, rate: 0.24, label: '24%' },
  { min: 197_300, max:   250_525, rate: 0.32, label: '32%' },
  { min: 250_525, max:   626_350, rate: 0.35, label: '35%' },
  { min: 626_350, max:      null, rate: 0.37, label: '37%' },
];

export const MAX_STORY_INCOME = 250_525;

export interface TaxResult {
  taxesPaid: number;
  marginalRate: number;
  bracketIndex: number;
  effectiveRate: number;
  kept: number;
}

export function computeTax(income: number): TaxResult {
  let taxesPaid = 0;
  let bracketIndex = 0;

  for (let i = 0; i < BRACKETS.length; i++) {
    const b = BRACKETS[i];
    if (income <= b.min) break;
    const cap = b.max ?? Infinity;
    taxesPaid += (Math.min(income, cap) - b.min) * b.rate;
    bracketIndex = i;
  }

  const marginalRate = BRACKETS[bracketIndex].rate;
  const effectiveRate = income > 0 ? taxesPaid / income : 0;
  return { taxesPaid, marginalRate, bracketIndex, effectiveRate, kept: income - taxesPaid };
}

// Piecewise scroll-to-income mapping.
// Bracket 1 gets extra scroll space so bills flow more slowly there.
// Flat pause segments at each bracket boundary: income freezes, bills suspend,
// the knife shifts, and the user absorbs the new rate before bills resume.
const SCROLL_SEGMENTS = [
  { p0: 0.00, p1: 0.22, i0:       0, i1:  11_925 }, // 10%: wide — deliberate pace
  { p0: 0.22, p1: 0.26, i0:  11_925, i1:  11_925 }, // pause — knife shifts to 12%
  { p0: 0.26, p1: 0.44, i0:  11_925, i1:  48_475 }, // 12%
  { p0: 0.44, p1: 0.48, i0:  48_475, i1:  48_475 }, // pause — knife shifts to 22%
  { p0: 0.48, p1: 0.65, i0:  48_475, i1: 103_350 }, // 22%
  { p0: 0.65, p1: 0.69, i0: 103_350, i1: 103_350 }, // pause — knife shifts to 24%
  { p0: 0.69, p1: 0.82, i0: 103_350, i1: 197_300 }, // 24%
  { p0: 0.82, p1: 0.86, i0: 197_300, i1: 197_300 }, // pause — knife shifts to 32%
  { p0: 0.86, p1: 1.00, i0: 197_300, i1: 250_525 }, // 32%
];

export function incomeFromProgress(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  for (const seg of SCROLL_SEGMENTS) {
    if (p <= seg.p1) {
      const t = (p - seg.p0) / (seg.p1 - seg.p0);
      return seg.i0 + t * (seg.i1 - seg.i0);
    }
  }
  return MAX_STORY_INCOME;
}
