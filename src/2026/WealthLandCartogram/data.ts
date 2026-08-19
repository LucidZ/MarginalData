export interface WealthGroup {
  id: string;
  name: string;
  /** % of adults in this wealth band, among the 56 markets this data covers
   *  (informational; not used for area sizing) — see the SAMPLE_* constants
   *  below for why this isn't literally "% of world population". */
  populationShare: number;
  /** % of this sample's wealth this band holds — this is what sizes the claimed land area */
  wealthShare: number;
  color: string;
  /** true only for the top band: it has no upper dollar bound, so its average
   *  wealth/person is pulled up hard by a small number of billionaires inside
   *  it — worth calling out anywhere that average gets displayed. */
  openEnded?: boolean;
}

// Source: UBS Global Wealth Report 2026 ("The global wealth pyramid 2025",
// p.23), year-end 2025 data. UBS models 56 major markets it estimates cover
// over 92% of global wealth — but that sample skips a lot of lower-income
// countries that hold little wealth but plenty of *people*, so its
// population figures run well short of true world population (its adults
// sum to ~3.85bn here, vs. a real global adult population around 5.6–5.8bn).
// Rather than present sample-only numbers as if they were literally "the
// world" (which the previous 2022 Global Wealth Databook source did aim
// for), this app now frames itself around "the 56 major markets UBS
// tracks" — see SAMPLE_ADULTS / SAMPLE_TOTAL_WEALTH_USD below, and the
// header/footnote copy in App.tsx.
// Ordered bottom-up: smallest wealth share grows first (uncontested), largest
// grows last, claiming whatever land remains. Seed points are no longer part
// of the static data — the user places them by clicking the map.
export const WEALTH_GROUPS: WealthGroup[] = [
  {
    id: "under-10k",
    name: "< $10,000",
    populationShare: 0.421,
    wealthShare: 0.006,
    color: "#3b6ea5",
  },
  {
    id: "10k-100k",
    name: "$10K – $100K",
    populationShare: 0.411,
    wealthShare: 0.122,
    color: "#4f9d8f",
  },
  {
    id: "100k-1m",
    name: "$100K – $1M",
    populationShare: 0.153,
    wealthShare: 0.388,
    color: "#d9a441",
  },
  {
    id: "1m-plus",
    name: "$1M+ (millionaires)",
    populationShare: 0.015,
    wealthShare: 0.484,
    color: "#c1443c",
    openEnded: true,
  },
];

// "Land" here means all land minus Antarctica (~141M km²), not the narrower
// "habitable land" figure (~104M km², which also excludes ice sheets and
// desert) — a deliberate simplification: this piece trades precision for the
// legibility of comparing against real, recognizable geography.
export const TOTAL_LAND_KM2 = 141_000_000;

// Total adults across the 56 markets this data covers, end of 2025 (UBS
// Global Wealth Report 2026) — the sum of the four band headcounts on the
// wealth pyramid (1.62bn + 1.58bn + 588m + 58m). Deliberately *not* named
// "global": this is the sample UBS models, not true world adult population
// (see the note above WEALTH_GROUPS). Used only to turn each group's land
// share into a *per-person* figure below the map; area sizing on the map
// itself is driven entirely by wealthShare and doesn't use this at all.
export const SAMPLE_ADULTS = 3_846_000_000;

// Total wealth across those same 56 markets, end of 2025 (UBS Global Wealth
// Report 2026) — the sum of the four band dollar figures on the same
// pyramid (USD 3.22tn + 63.16tn + 200.72tn + 250.59tn). Used only to show
// the average-wealth-per-person dollar figure alongside the per-person land
// row for the open-ended $1M+ band — that figure is what actually drives
// its land/pitch count.
export const SAMPLE_TOTAL_WEALTH_USD = 517_690_000_000_000;
