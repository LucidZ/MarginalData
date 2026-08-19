export interface WealthGroup {
  id: string;
  name: string;
  /** % of global adults in this wealth band (informational; not used for area sizing) */
  populationShare: number;
  /** % of global wealth this band holds — this is what sizes the claimed land area */
  wealthShare: number;
  color: string;
  /** true only for the top band: it has no upper dollar bound, so its average
   *  wealth/person is pulled up hard by a small number of billionaires inside
   *  it — worth calling out anywhere that average gets displayed. */
  openEnded?: boolean;
}

// Source: Global Wealth Databook (Shorrocks, Davies, Lluberas), end of 2022 —
// same methodology underlying the UBS/Credit Suisse Global Wealth Report.
// Ordered bottom-up: smallest wealth share grows first (uncontested), largest
// grows last, claiming whatever land remains. Seed points are no longer part
// of the static data — the user places them by clicking the map.
export const WEALTH_GROUPS: WealthGroup[] = [
  {
    id: "under-10k",
    name: "< $10,000",
    populationShare: 0.53,
    wealthShare: 0.01,
    color: "#3b6ea5",
  },
  {
    id: "10k-100k",
    name: "$10K – $100K",
    populationShare: 0.341,
    wealthShare: 0.136,
    color: "#4f9d8f",
  },
  {
    id: "100k-1m",
    name: "$100K – $1M",
    populationShare: 0.121,
    wealthShare: 0.394,
    color: "#d9a441",
  },
  {
    id: "1m-plus",
    name: "$1M+ (millionaires)",
    populationShare: 0.011,
    wealthShare: 0.46,
    color: "#c1443c",
    openEnded: true,
  },
];

// "Land" here means all land minus Antarctica (~141M km²), not the narrower
// "habitable land" figure (~104M km², which also excludes ice sheets and
// desert) — a deliberate simplification: this piece trades precision for the
// legibility of comparing against real, recognizable geography.
export const TOTAL_LAND_KM2 = 141_000_000;

// Global adult population, end of 2022 — same source/vintage as WEALTH_GROUPS
// (UBS/Credit Suisse Global Wealth Databook). Used only to turn each group's
// land share into a *per-person* figure below the map; area sizing on the map
// itself is driven entirely by wealthShare and doesn't use this at all.
export const GLOBAL_ADULTS = 5_400_000_000;

// Total global private wealth, end of 2022 (UBS Global Wealth Report 2023,
// same vintage as the two constants above): USD 454.4 trillion, USD 84,718
// mean wealth per adult. Used only to show the average-wealth-per-person
// dollar figure alongside the per-person land row for the open-ended $1M+
// band — that figure is what actually drives its land/pitch count.
export const TOTAL_GLOBAL_WEALTH_USD = 454_400_000_000_000;
