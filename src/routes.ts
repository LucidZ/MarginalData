import type { ComponentType } from "react";

export interface RouteEntry {
  path: string; // "/2026/MarginalTax"
  title: string; // "How Marginal Tax Rates Actually Work — Marginal Data"
  description: string; // one-line, ~150 char, used for <meta description> and OG
  component: () => Promise<{ default: ComponentType }>; // the lazy() import
  group: string; // "Government & Politics" etc — matches HomePage.tsx groups
  image?: string; // "/og/marginal-tax.png" — optional, added in a later pass
  date: string; // ISO publish date, from `git log --diff-filter=A`; source of truth for the feed, ignore the /2025//2026/ path
  note: string; // first-person: what I was trying to figure out. Not the SEO description.
}

// Informational pages (just About, currently) — not a project story, so
// kept out of ROUTES/the homepage feed, but still gets a real
// title/description stamped by generate-static-pages.mjs the same way.
// Privacy and AI Use used to be separate pages here too; both were folded
// into About (2026-08-26) — see project_public_launch_plan.md §5.
export interface StaticPage {
  path: string;
  title: string;
  description: string;
}

export const STATIC_PAGES: StaticPage[] = [
  {
    path: "/about",
    title: "About — Marginal Data",
    description:
      "What Marginal Data is, why it's called that, and how to get in touch.",
  },
];

export const ROUTES: RouteEntry[] = [
  {
    path: "/2025/USAIDSize",
    title: "How Big Was USAID? — Marginal Data",
    description:
      "Guess how large USAID's budget actually was compared to the rest of the federal budget, then see the real numbers.",
    component: () => import("./2025/USAIDSize"),
    group: "Government & Politics",
    image: "/og/usaid-size.jpg",
    date: "2025-05-07",
    note: "Where this whole site started. I think good data viz can inform people, but I often feel valuable insights get glossed over. I wanted readers to engage with their prior beliefs by forcing them to guess first, then reveal the real numbers.",
  },
  {
    path: "/2025/ForeignAid",
    title: "How Does US Foreign Aid Rank Globally? — Marginal Data",
    description:
      "Comparing US foreign aid spending against other countries, in absolute dollars and as a share of GDP.",
    component: () => import("./2025/ForeignAid"),
    group: "Government & Politics",
    image: "/og/foreign-aid.jpg",
    date: "2025-05-08",
    note: "Part of the same early idea: make readers guess before showing them the real numbers, this time on how US foreign aid compares globally.",
  },
  {
    path: "/2025/FederalEmployment",
    title: "How Big Is US Federal Employment? — Marginal Data",
    description:
      "Putting the size of the federal workforce in context against state, local, and private-sector employment.",
    component: () => import("./2025/FederalEmployment"),
    group: "Government & Politics",
    image: "/og/federal-employment.jpg",
    date: "2025-05-08",
    note: "The third of the guess-first trio that opened this site: put the size of the federal workforce next to state, local, and private-sector employment before revealing it.",
  },
  {
    path: "/2026/VoterAffiliation",
    title: "Colorado Voter Affiliation, 2016–2026 — Marginal Data",
    description:
      "A decade of county-level voter registration trends across Colorado, explored with ternary and cartesian charts.",
    component: () => import("./2026/VoterAffiliation"),
    group: "Government & Politics",
    image: "/og/voter-affiliation.jpg",
    date: "2026-07-06",
    note: "Ran into ternary plots for the first time and wanted to learn how they work, comparing one against a standard cartesian view of the same data.",
  },
  {
    path: "/2026/MarginalTax",
    title: "How Marginal Tax Rates Actually Work — Marginal Data",
    description:
      "A scrollytelling walkthrough of how tax brackets apply only to the dollars within them, not your whole income.",
    component: () => import("./2026/MarginalTax"),
    group: "Personal Finance",
    image: "/og/marginal-tax.jpg",
    date: "2026-07-07",
    note: "Marginal tax rates is a commonly misunderstood idea in personal finance. I wanted to see if a scrollyteller that looks at each \"marginal\" dollar earned can show how they work instead of telling how they work.",
  },
  {
    path: "/2026/PassingCompass",
    title: "Passing Compass — Marginal Data",
    description:
      "Visualizing every pass from the 2022 World Cup Final as a vector, encoding direction and distance on a compass.",
    component: () => import("./2026/PassingCompass"),
    group: "Soccer Analytics",
    image: "/og/passing-compass.jpg",
    date: "2026-07-22",
    note: "Watching the World Cup got me curious what soccer tracking data exists to play with. StatsBomb's free open data only covers the 2022 final though, so that's what this uses (Argentina vs. France, not this year's tournament). Despite how noisy it is, you can still tell players apart by their passing compass.",
  },
  {
    path: "/2026/PassingTriangleMatchingGame",
    title: "Passing Triangle Matching Game — Marginal Data",
    description:
      "Match player jerseys to their passing triangles from the 2022 World Cup Final in this quick guessing game.",
    component: () => import("./2026/PassingTriangleMatchingGame"),
    group: "Soccer Analytics",
    image: "/og/passing-triangle-matching-game.jpg",
    date: "2026-07-24",
    note: "Kept going with that same 2022 final data, adding pitch context to passing sequences and turning it into an interactive matching game.",
  },
  {
    path: "/2026/PossessionShape",
    title: "Possession Shape: Argentina vs. France — Marginal Data",
    description:
      "Comparing each team's average player positioning in and out of possession during the 2022 World Cup Final.",
    component: () => import("./2026/PossessionShape"),
    group: "Soccer Analytics",
    image: "/og/possession-shape.jpg",
    date: "2026-07-30",
    note: "A follow-up to the other two, still the same 2022 final: team shape, and how positioning shifts from defense to offense.",
  },
  {
    path: "/2025/DecisionVectorizer",
    title: "Decision Vectorizer — Marginal Data",
    description:
      "Visualizing decisions as vectors, combining weighted factors to compare options against each other.",
    component: () => import("./2025/DecisionVectorizer"),
    group: "Decision-Making",
    image: "/og/decision-vectorizer.jpg",
    date: "2025-12-16",
    note: "My partner was stuck choosing between two jobs, so I built this and its companion tool to break the decision into its weighted parts.",
  },
  {
    path: "/2025/DecisionComponentAnalyzer",
    title: "Decision Component Analyzer — Marginal Data",
    description:
      "Breaking a decision down into its weighted components to see what's actually driving the choice.",
    component: () => import("./2025/DecisionComponentAnalyzer"),
    group: "Decision-Making",
    image: "/og/decision-component-analyzer.jpg",
    date: "2025-12-15",
    note: "Another version of yesterday's Decision Vectorizer, just breaking it down a different way.",
  },
  {
    path: "/2025/PizzaAreaComparison",
    title: "How Much More Pizza Is a Large? — Marginal Data",
    description:
      "An interactive pizza-size slider showing how area, not diameter, actually determines how much pizza you get.",
    component: () => import("./2025/PizzaAreaComparison"),
    group: "Everyday Comparisons",
    image: "/og/pizza-area-comparison.jpg",
    date: "2025-11-11",
    note: "A silly little tool for how much more pizza (and crust) you actually get as size goes up.",
  },
  {
    path: "/2026/WealthLandCartogram",
    title: "If Wealth Were Land — Marginal Data",
    description:
      "Global wealth inequality redrawn as claimed territory on a world map, sized by each group's share of wealth.",
    component: () => import("./2026/WealthLandCartogram"),
    group: "Everyday Comparisons",
    image: "/og/wealth-land-cartogram.png",
    date: "2026-08-24",
    note: "Wealth distributions have always felt hard to intuit. I wanted to see if grounding the data in something tangible, like land area, would make the inequality easier to feel.",
  },
  {
    path: "/2026/USWealthLandCartogram",
    title: "If American Wealth Were Land — Marginal Data",
    description:
      "U.S. wealth inequality redrawn as claimed territory across the 48 contiguous states, sized by each group's real share of net worth.",
    component: () => import("./2026/USWealthLandCartogram"),
    group: "Everyday Comparisons",
    date: "2026-08-28",
    note: "A U.S.-focused follow-up to the global wealth-land cartogram, using real Federal Reserve data instead of a global model.",
  },
  {
    path: "/2025/FuelEconomyTool",
    title: "Compare Vehicle Fuel Efficiency — Marginal Data",
    description:
      "Look up and compare real fuel economy ratings across vehicles side by side.",
    component: () => import("./2025/FuelEconomyTool"),
    group: "Everyday Comparisons",
    image: "/og/fuel-economy-tool.jpg",
    date: "2025-11-03",
    note: "My first time pulling data from a live API. Fueleconomy.gov's public API seemed like a good place to start.",
  },
  {
    path: "/2025/FuelEconomyCurve",
    title: "Fuel Economy Curve Visualization — Marginal Data",
    description:
      "Plotting how a vehicle's fuel efficiency changes with speed across its full operating range.",
    component: () => import("./2025/FuelEconomyCurve"),
    group: "Everyday Comparisons",
    image: "/og/fuel-economy-curve.jpg",
    date: "2025-11-05",
    note: "Wanted to compare fuel economy across different kinds of cars on a single plot.",
  },
  {
    path: "/2025/SolarAnimation",
    title: "Solar Generation Explorer — Marginal Data",
    description:
      "An animated look at how solar power generation rises and falls across the day and across seasons.",
    component: () => import("./2025/SolarAnimation"),
    group: "Explorers & Simulators",
    image: "/og/solar-animation.jpg",
    date: "2025-12-04",
    note: "Curious how much solar generation varies across a day and between summer and winter, and wanted to try building a stepper-style story while I was at it.",
  },
  {
    path: "/2025/ImageScrambler",
    title: "Image Scrambler — Marginal Data",
    description:
      "Scramble and reassemble images to explore how puzzle difficulty scales with the number of pieces.",
    component: () => import("./2025/ImageScrambler"),
    group: "Explorers & Simulators",
    image: "/og/image-scrambler.jpg",
    date: "2025-12-12",
    note: "A small toy exploring an unscrambling mechanic. I still haven't found a real use for it, but I think the effect is neat.",
  },
  {
    path: "/2025/HowMany13ers",
    title: "How Many 13ers? Colorado Summits Explorer — Marginal Data",
    description:
      "An interactive map and filterable table of all 3,200+ named summits in Colorado, from 14ers to foothills.",
    component: () => import("./2025/HowMany13ers"),
    group: "Explorers & Simulators",
    image: "/og/how-many13ers.jpg",
    date: "2025-12-18",
    note: "Colorado is obsessed with 14ers, but I've always thought 13ers have just-as-good views with way fewer people. Sliding the filter along creates an oddly pleasing visual.",
  },
  {
    path: "/2025/SpaceTraveler",
    title: "Expanse-Style Space Travel Simulator — Marginal Data",
    description:
      "A brachistochrone trajectory simulator calculating realistic flip-and-burn travel times between planets.",
    component: () => import("./2025/SpaceTraveler"),
    group: "Explorers & Simulators",
    image: "/og/space-traveler.jpg",
    date: "2026-02-16",
    note: "In the book The Expanse, ships simulate gravity by accelerating at the same rate gravity pulls on Earth. I wanted to see what that travel actually looks like as planets orbit. Turns out it's a lot faster than expected.",
  },
];
