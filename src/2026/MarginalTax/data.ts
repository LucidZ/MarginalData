// 2026 US Federal Income Tax Brackets — Single Filer (Tax Year 2026)
// Source: IRS tax inflation adjustments for tax year 2026

export interface Bracket {
  min: number;
  max: number | null;
  rate: number;
  label: string;
}

export const BRACKETS: Bracket[] = [
  { min:       0, max:    12_400, rate: 0.10, label: '10%' },
  { min:  12_400, max:    50_400, rate: 0.12, label: '12%' },
  { min:  50_400, max:   105_700, rate: 0.22, label: '22%' },
  { min: 105_700, max:   201_775, rate: 0.24, label: '24%' },
  { min: 201_775, max:   256_225, rate: 0.32, label: '32%' },
  { min: 256_225, max:   640_600, rate: 0.35, label: '35%' },
  { min: 640_600, max:      null, rate: 0.37, label: '37%' },
];

// Story stops at the 37% threshold — the punchline step freezes here
export const MAX_STORY_INCOME = 640_600;

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

// Seven equal ~14.3% scroll segments: six brackets + one frozen punchline.
// Each boundary aligns with when that step's text centers on screen
// (450vh desktop / 250vh mobile steps each occupy ~1/7 of total scroll height).
const k = 1 / 7;
const SCROLL_SEGMENTS = [
  { p0: 0 * k, p1: 1 * k, i0:       0, i1:  12_400 }, // 10%
  { p0: 1 * k, p1: 2 * k, i0:  12_400, i1:  50_400 }, // 12%
  { p0: 2 * k, p1: 3 * k, i0:  50_400, i1: 105_700 }, // 22%
  { p0: 3 * k, p1: 4 * k, i0: 105_700, i1: 201_775 }, // 24%
  { p0: 4 * k, p1: 5 * k, i0: 201_775, i1: 256_225 }, // 32%
  { p0: 5 * k, p1: 6 * k, i0: 256_225, i1: 640_600 }, // 35%
  { p0: 6 * k, p1: 1.000, i0: 640_600, i1: 640_600 }, // punchline — frozen at 37% threshold
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
