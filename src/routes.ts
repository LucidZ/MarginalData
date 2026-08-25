import type { ComponentType } from "react";

export interface RouteEntry {
  path: string; // "/2026/MarginalTax"
  title: string; // "How Marginal Tax Rates Actually Work — Marginal Data"
  description: string; // one-line, ~150 char, used for <meta description> and OG
  component: () => Promise<{ default: ComponentType }>; // the lazy() import
  group: string; // "Government & Politics" etc — matches HomePage.tsx groups
  image?: string; // "/og/marginal-tax.png" — optional, added in a later pass
}

export const ROUTES: RouteEntry[] = [
  {
    path: "/2025/USAIDSize",
    title: "How Big Was USAID? — Marginal Data",
    description:
      "Guess how large USAID's budget actually was compared to the rest of the federal budget, then see the real numbers.",
    component: () => import("./2025/USAIDSize"),
    group: "Government & Politics",
  },
  {
    path: "/2025/ForeignAid",
    title: "How Does US Foreign Aid Rank Globally? — Marginal Data",
    description:
      "Comparing US foreign aid spending against other countries, in absolute dollars and as a share of GDP.",
    component: () => import("./2025/ForeignAid"),
    group: "Government & Politics",
  },
  {
    path: "/2025/FederalEmployment",
    title: "How Big Is US Federal Employment? — Marginal Data",
    description:
      "Putting the size of the federal workforce in context against state, local, and private-sector employment.",
    component: () => import("./2025/FederalEmployment"),
    group: "Government & Politics",
  },
  {
    path: "/2026/VoterAffiliation",
    title: "Colorado Voter Affiliation, 2016–2026 — Marginal Data",
    description:
      "A decade of county-level voter registration trends across Colorado, explored with ternary and cartesian charts.",
    component: () => import("./2026/VoterAffiliation"),
    group: "Government & Politics",
  },
  {
    path: "/2026/MarginalTax",
    title: "How Marginal Tax Rates Actually Work — Marginal Data",
    description:
      "A scrollytelling walkthrough of how tax brackets apply only to the dollars within them, not your whole income.",
    component: () => import("./2026/MarginalTax"),
    group: "Personal Finance",
  },
  {
    path: "/2026/PassingCompass",
    title: "Passing Compass — Marginal Data",
    description:
      "Visualizing every pass from the 2022 World Cup Final as a vector, encoding direction and distance on a compass.",
    component: () => import("./2026/PassingCompass"),
    group: "Soccer Analytics",
  },
  {
    path: "/2026/PassingTriangleMatchingGame",
    title: "Passing Triangle Matching Game — Marginal Data",
    description:
      "Match player jerseys to their passing triangles from the 2022 World Cup Final in this quick guessing game.",
    component: () => import("./2026/PassingTriangleMatchingGame"),
    group: "Soccer Analytics",
  },
  {
    path: "/2026/PossessionShape",
    title: "Possession Shape: Argentina vs. France — Marginal Data",
    description:
      "Comparing each team's average player positioning in and out of possession during the 2022 World Cup Final.",
    component: () => import("./2026/PossessionShape"),
    group: "Soccer Analytics",
  },
  {
    path: "/2025/DecisionVectorizer",
    title: "Decision Vectorizer — Marginal Data",
    description:
      "Visualizing decisions as vectors, combining weighted factors to compare options against each other.",
    component: () => import("./2025/DecisionVectorizer"),
    group: "Decision-Making",
  },
  {
    path: "/2025/DecisionComponentAnalyzer",
    title: "Decision Component Analyzer — Marginal Data",
    description:
      "Breaking a decision down into its weighted components to see what's actually driving the choice.",
    component: () => import("./2025/DecisionComponentAnalyzer"),
    group: "Decision-Making",
  },
  {
    path: "/2025/PizzaAreaComparison",
    title: "How Much More Pizza Is a Large? — Marginal Data",
    description:
      "An interactive pizza-size slider showing how area, not diameter, actually determines how much pizza you get.",
    component: () => import("./2025/PizzaAreaComparison"),
    group: "Everyday Comparisons",
  },
  {
    path: "/2026/WealthLandCartogram",
    title: "If Wealth Were Land — Marginal Data",
    description:
      "Global wealth inequality redrawn as claimed territory on a world map, sized by each group's share of wealth.",
    component: () => import("./2026/WealthLandCartogram"),
    group: "Everyday Comparisons",
    image: "/og/wealth-land-cartogram.png",
  },
  {
    path: "/2025/FuelEconomyTool",
    title: "Compare Vehicle Fuel Efficiency — Marginal Data",
    description:
      "Look up and compare real fuel economy ratings across vehicles side by side.",
    component: () => import("./2025/FuelEconomyTool"),
    group: "Everyday Comparisons",
  },
  {
    path: "/2025/FuelEconomyCurve",
    title: "Fuel Economy Curve Visualization — Marginal Data",
    description:
      "Plotting how a vehicle's fuel efficiency changes with speed across its full operating range.",
    component: () => import("./2025/FuelEconomyCurve"),
    group: "Everyday Comparisons",
  },
  {
    path: "/2025/SolarAnimation",
    title: "Solar Generation Explorer — Marginal Data",
    description:
      "An animated look at how solar power generation rises and falls across the day and across seasons.",
    component: () => import("./2025/SolarAnimation"),
    group: "Explorers & Simulators",
  },
  {
    path: "/2025/ImageScrambler",
    title: "Image Scrambler — Marginal Data",
    description:
      "Scramble and reassemble images to explore how puzzle difficulty scales with the number of pieces.",
    component: () => import("./2025/ImageScrambler"),
    group: "Explorers & Simulators",
  },
  {
    path: "/2025/HowMany13ers",
    title: "How Many 13ers? Colorado Summits Explorer — Marginal Data",
    description:
      "An interactive map and filterable table of all 3,200+ named summits in Colorado, from 14ers to foothills.",
    component: () => import("./2025/HowMany13ers"),
    group: "Explorers & Simulators",
  },
  {
    path: "/2025/SpaceTraveler",
    title: "Expanse-Style Space Travel Simulator — Marginal Data",
    description:
      "A brachistochrone trajectory simulator calculating realistic flip-and-burn travel times between planets.",
    component: () => import("./2025/SpaceTraveler"),
    group: "Explorers & Simulators",
  },
];
