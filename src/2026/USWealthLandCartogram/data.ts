export interface WealthGroup {
  id: string;
  name: string;
  /** % of adults in this wealth band — exact by construction (these bands
   *  ARE population percentiles: bottom 50%, next 40%, etc.), unlike the
   *  global version's UBS dollar-bands, which needed separate population
   *  sourcing to figure out how many people fall in each one. */
  populationShare: number;
  /** % of net worth this band holds — this is what sizes the claimed land area. */
  wealthShare: number;
  color: string;
  /** true only for the top band: like the global version's $1M+ band, "Top
   *  1%" has no upper dollar bound, so its average wealth/person is pulled
   *  up hard by a small number of extremely wealthy people inside it —
   *  worth calling out anywhere that average gets displayed. */
  openEnded?: boolean;
}

// Source: Federal Reserve Distributional Financial Accounts (DFA),
// 2026:Q1 (most recent quarter as of writing). Pulled directly from the
// DFA's own raw levels CSV (federalreserve.gov/releases/z1/dataviz/download/
// dfa-networth-levels.csv) and computed as shares by hand — DO NOT trust an
// auto-summarized read of that CSV without re-checking the raw rows/columns
// yourself first; a first pass at this data (and a second, independent
// pass during the US restart) both mis-parsed it and produced an
// implausible ~20% top-1% share by silently dropping the "Next40" category
// out of the total. Verified final shares below reconcile to 100% and match
// independently-known ballpark figures for US wealth concentration.
// TopPt1 + RemainingTop1 = "Top 1%"; Next9 = 90th-99th; Next40 = 50th-90th;
// Bottom50 = 0-50th. Ordered bottom-up to match the global version's
// placement order: smallest wealth share grows first (uncontested), largest
// grows last, claiming whatever land remains.
export const WEALTH_GROUPS: WealthGroup[] = [
  {
    id: "bottom50",
    name: "Bottom 50%",
    populationShare: 0.5,
    wealthShare: 0.0245,
    color: "#3b6ea5",
  },
  {
    id: "next40",
    name: "Next 40% (50th-90th)",
    populationShare: 0.4,
    wealthShare: 0.2959,
    color: "#4f9d8f",
  },
  {
    id: "next9",
    name: "Next 9% (90th-99th)",
    populationShare: 0.09,
    wealthShare: 0.3633,
    color: "#d9a441",
  },
  {
    id: "top1",
    name: "Top 1%",
    populationShare: 0.01,
    wealthShare: 0.3163,
    color: "#c1443c",
    openEnded: true,
  },
];

// Sum of geoArea() over the 48 contiguous states + DC, computed directly
// from the same states-geo.json boundaries this app renders (internal
// consistency over matching an external "official" total, same philosophy
// as the global version's land-mask simplification). Recomputed if the
// boundary data changes — see scratch-build-states.mjs in the worktree root.
export const TOTAL_LAND_KM2 = 7_803_383;

// Total US adults (18+), Census Bureau Vintage 2025 population estimate:
// ~78.5% of the July 1, 2025 resident population total (341,784,857).
// Deliberately an estimate, not a table lookup of the exact 18+ figure (the
// Census's own SCPRC-EST2025-18+POP breakout table wasn't pulled directly)
// — same "close enough to be honest, not worth a bigger data lift" spirit
// as the global version's habitable-land simplification. Used only to turn
// each group's land share into a per-person figure below the map; area
// sizing on the map itself is driven entirely by wealthShare and doesn't
// use this at all.
export const TOTAL_US_ADULTS = 268_300_000;

// Total US household net worth, 2026:Q1 (Federal Reserve DFA) — the sum of
// the same four raw net-worth levels (in millions of dollars) that
// WEALTH_GROUPS' shares above were computed from: TopPt1 $25,072,282M +
// RemainingTop1 $29,960,718M + Next9 $63,225,396M + Next40 $51,484,864M +
// Bottom50 $4,266,359M = $174,009,619M. This reconciling exactly with the
// independently-verified percentage shares above is itself a good sanity
// check that both numbers are real. Used only to show the average-wealth-
// per-person dollar figure alongside the per-person land row for the
// open-ended Top 1% band — that figure is what actually drives its land/
// field count.
export const TOTAL_US_WEALTH_USD = 174_009_619_000_000;
