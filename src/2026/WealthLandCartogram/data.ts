export interface WealthGroup {
  id: string;
  name: string;
  /** % of global adults in this wealth band (informational; not used for area sizing) */
  populationShare: number;
  /** % of global wealth this band holds — this is what sizes the claimed land area */
  wealthShare: number;
  color: string;
  /** [lon, lat] starting point the region grows from */
  seed: [number, number];
}

// Source: Global Wealth Databook (Shorrocks, Davies, Lluberas), end of 2022 —
// same methodology underlying the UBS/Credit Suisse Global Wealth Report.
// Ordered bottom-up: smallest wealth share grows first (uncontested), largest
// grows last, claiming whatever land remains.
export const WEALTH_GROUPS: WealthGroup[] = [
  {
    id: "under-10k",
    name: "< $10,000",
    populationShare: 0.53,
    wealthShare: 0.01,
    color: "#3b6ea5",
    seed: [3.4, 6.5], // Lagos
  },
  {
    id: "10k-100k",
    name: "$10K – $100K",
    populationShare: 0.341,
    wealthShare: 0.136,
    color: "#4f9d8f",
    seed: [31.2, 30.0], // Cairo
  },
  {
    id: "100k-1m",
    name: "$100K – $1M",
    populationShare: 0.121,
    wealthShare: 0.394,
    color: "#d9a441",
    seed: [36.8, -1.3], // Nairobi
  },
  {
    id: "1m-plus",
    name: "$1M+ (millionaires)",
    populationShare: 0.011,
    wealthShare: 0.46,
    color: "#c1443c",
    seed: [15.3, -4.3], // Kinshasa
  },
];

// "Land" here means all land minus Antarctica (~141M km²), not the narrower
// "habitable land" figure (~104M km², which also excludes ice sheets and
// desert) — a deliberate simplification: this piece trades precision for the
// legibility of comparing against real, recognizable geography.
export const TOTAL_LAND_KM2 = 141_000_000;
