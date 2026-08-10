// 1 grain of rice ≈ 25 mg = 0.000025 kg
export const GRAIN_WEIGHT_KG = 0.000025;

export type EquivalentIcon =
  | 'grain' | 'egg' | 'soda' | 'pineapple' | 'baby' | 'dog'
  | 'horse' | 'hippo' | 'elephant' | 'bus' | 'whale'
  | 'liberty' | 'plane' | 'tower' | 'pyramid' | 'carrier';

export interface Equivalent {
  label: string;
  actualWeightKg: number;
  icon: EquivalentIcon;
}

export interface Annotation {
  headline: string;
  body: string;
}

export interface SquareData {
  square: number;
  row: number;
  col: number;
  grainsOnSquare: bigint;
  cumulativeGrains: bigint;
  weightKg: number;
  annotation?: Annotation;
  equivalent?: Equivalent;
}

// ── Narrative annotations at key squares ──────────────────────────────────────

const ANNOTATIONS: Record<number, Annotation> = {
  1: {
    headline: 'The wise man makes his request',
    body: 'A wise man presents the game of chess to a king. Delighted, the king offers any reward. The man asks only for rice: one grain on the first square, doubling each square after. The king laughs — and agrees.',
  },
  8: {
    headline: 'End of the first row',
    body: 'Eight squares in, 255 total grains — about 6 grams. You could hold the entire first row in your palm. The king has no reason to worry.',
  },
  16: {
    headline: 'The king is still not worried',
    body: 'Sixteen squares down. This square alone holds 32,768 grains — less than a water bottle\'s worth of rice. Two full rows complete, and the royal granaries have barely noticed.',
  },
  22: {
    headline: 'A person\'s weight in rice',
    body: 'Square 22 holds roughly the weight of an adult. This is the first square where you\'d need a forklift just for one square\'s grains. The king\'s advisors are starting to whisper.',
  },
  29: {
    headline: 'An elephant, on one square',
    body: 'The 29th square holds more than the weight of a full-grown African elephant. The king has sent riders to neighboring kingdoms. There is not enough grain in the land.',
  },
  33: {
    headline: 'A blue whale',
    body: 'Square 33 holds the weight of a blue whale — the largest animal that has ever existed on Earth. The king has mortgaged the kingdom. It will not be enough.',
  },
  40: {
    headline: 'The kingdom is ruined',
    body: 'A prosperous ancient kingdom might grow 1,000 tonnes of grain a year. Square 40 alone demands 13,744 tonnes — over a decade of that kingdom\'s entire harvest for a single square.',
  },
  50: {
    headline: 'Beyond any granary on Earth',
    body: 'Square 50 requires more grain than the largest national grain reserves ever recorded. We have left the realm of what can physically exist in one place.',
  },
  55: {
    headline: 'A year of Earth\'s entire rice harvest',
    body: 'Square 55 requires roughly 450 million tonnes — nearly the annual rice production of the entire planet. All of it. For one square. Thirty-two squares remain.',
  },
  64: {
    headline: 'The final square — the debt no kingdom could pay',
    body: 'Square 64 alone holds 9.2 quintillion grains. The total across all 64 squares: 18.4 quintillion grains — about 461 billion tonnes. The world grows roughly 520 million tonnes of rice per year. Repaying this debt would take approximately 900 years of the entire planet\'s harvest. No king could ever pay it. No kingdom ever could.',
  },
};

// ── Weight equivalents at key squares ─────────────────────────────────────────
// Weight of square n = 2^(n-1) × 0.000025 kg

const EQUIVALENTS: Record<number, Equivalent> = {
  12: { label: 'a chicken egg',                actualWeightKg: 0.055,       icon: 'egg'      }, // sq: 0.051 kg
  15: { label: 'a can of soda',                actualWeightKg: 0.385,       icon: 'soda'     }, // sq: 0.410 kg
  17: { label: 'a pineapple',                  actualWeightKg: 1.6,         icon: 'pineapple'}, // sq: 1.64 kg
  18: { label: 'a newborn baby',               actualWeightKg: 3.3,         icon: 'baby'     }, // sq: 3.28 kg
  21: { label: 'a Labrador retriever',         actualWeightKg: 30,          icon: 'dog'      }, // sq: 26.2 kg
  25: { label: 'a thoroughbred racehorse',     actualWeightKg: 500,         icon: 'horse'    }, // sq: 419 kg
  28: { label: 'a male hippopotamus',          actualWeightKg: 3500,        icon: 'hippo'    }, // sq: 3,355 kg
  29: { label: 'an African elephant',          actualWeightKg: 6000,        icon: 'elephant' }, // sq: 6,711 kg
  30: { label: 'a loaded school bus',          actualWeightKg: 13600,       icon: 'bus'      }, // sq: 13,422 kg
  33: { label: 'a blue whale',                 actualWeightKg: 120000,      icon: 'whale'    }, // sq: 107,374 kg
  34: { label: 'the Statue of Liberty',        actualWeightKg: 204117,      icon: 'liberty'  }, // sq: 214,748 kg
  35: { label: 'a fully-loaded Boeing 747',    actualWeightKg: 412775,      icon: 'plane'    }, // sq: 429,497 kg
  39: { label: 'the Eiffel Tower',             actualWeightKg: 7300000,     icon: 'tower'    }, // sq: 6,871,948 kg
  43: { label: 'a Nimitz-class aircraft carrier', actualWeightKg: 102000000, icon: 'carrier' }, // sq: 109,951,163 kg
  49: { label: 'the Great Pyramid of Giza',    actualWeightKg: 5900000000,  icon: 'pyramid'  }, // sq: 7,036,874,418 kg
};

// ── Build the full 64-square dataset ──────────────────────────────────────────

function buildSquares(): SquareData[] {
  let cumGrains = 0n;
  return Array.from({ length: 64 }, (_, i) => {
    const square = i + 1;
    const grains = 1n << BigInt(i);
    cumGrains += grains;
    return {
      square,
      row: Math.ceil(square / 8),
      col: ((square - 1) % 8) + 1,
      grainsOnSquare: grains,
      cumulativeGrains: cumGrains,
      weightKg: Number(grains) * GRAIN_WEIGHT_KG,
      annotation: ANNOTATIONS[square],
      equivalent: EQUIVALENTS[square],
    };
  });
}

export const SQUARES = buildSquares();

// ── Formatting helpers ─────────────────────────────────────────────────────────

export function formatGrains(n: bigint): string {
  if (n <= 1000n) return n.toLocaleString();
  const v = Number(n);
  if (v < 1e6)  return `${(v / 1e3).toFixed(1)}K`;
  if (v < 1e9)  return `${(v / 1e6).toFixed(2)}M`;
  if (v < 1e12) return `${(v / 1e9).toFixed(2)}B`;
  if (v < 1e15) return `${(v / 1e12).toFixed(2)} trillion`;
  if (v < 1e18) return `${(v / 1e15).toFixed(2)} quadrillion`;
  return `${(v / 1e18).toFixed(2)} quintillion`;
}

export function formatWeight(kg: number): string {
  if (kg < 0.001) return `${(kg * 1e6).toFixed(0)} mg`;
  if (kg < 1)     return `${(kg * 1e3).toFixed(1)} g`;
  if (kg < 1000)  return `${kg.toFixed(1)} kg`;
  // 1 tonne = 1,000 kg · 1 million tonnes = 1e9 kg · 1 billion tonnes = 1e12 kg
  if (kg < 1e6)   return `${(kg / 1e3).toFixed(1)} tonnes`;
  if (kg < 1e9)   return `${Math.round(kg / 1e3).toLocaleString()} tonnes`;
  if (kg < 1e12)  return `${(kg / 1e9).toFixed(1)} million tonnes`;
  if (kg < 1e15)  return `${(kg / 1e12).toFixed(1)} billion tonnes`;
  return `${(kg / 1e15).toFixed(1)} trillion tonnes`;
}

// Log10 position of a weight within the full range of the visualization (used for scale bar)
export const LOG_MIN = Math.log10(GRAIN_WEIGHT_KG);              // ~-4.6  (1 grain)
export const LOG_MAX = Math.log10(SQUARES[63].weightKg);         // ~14.4  (square 64)

export function logFraction(kg: number): number {
  return (Math.log10(Math.max(kg, 1e-10)) - LOG_MIN) / (LOG_MAX - LOG_MIN);
}
