import { useState, useEffect } from "react";
import VoterChart, { type County } from "./VoterChart";
import TernaryCartesianTranslator from "./TernaryCartesianTranslator";
import "./App.css";

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

interface StepConfig {
  chartType: "ternary" | "cartesian";
  highlights: string[];
  headline: string;
  body: React.ReactNode;
}

const STORY_STEPS: StepConfig[] = [
  {
    chartType: "ternary",
    highlights: [],
    headline: "A chart I saw on USAFacts.org",
    body: (
      <>
        <p>
          USAFacts published a series of interesting triangular plots of county level voter 
          registration data including this one for Colorado. I had never seen these 
          plots before and thought they looked interesting but felt hard to read. 
          Turns out these are called ternary charts and they are a textbook encoding 
          for three-part composition: each side of the triangle represents 0%-100% of 
          one group — Democrat, Republican, or Unaffiliated.
        </p>
        <p className="va-step-question">
          Take a look. What's your main takeaway?
        </p>
      </>
    ),
  },
  {
    chartType: "ternary",
    highlights: [],
    headline: "Counties are moving toward unaffiliated",
    body: (
      <>
        <p>
          Every county's trail drifts upward — toward the Unaffiliated corner at the
          apex of the triangle. Some counties moved faster than others, but the direction
          is nearly universal.
        </p>
        <p>
          The left-right partisan spread barely shifted by comparison. The big story is
          vertical: unaffiliated voters are overtaking both major parties.
        </p>
      </>
    ),
  },
  {
    chartType: "ternary",
    highlights: ["Denver", "Rio Blanco"],
    headline: "Two counties at opposite ends",
    body: (
      <>
        <p>
          <strong>Denver County</strong> is one of Colorado's most Democratic
          counties. <strong>Rio Blanco County</strong>, in the northwest corner of the
          state, leans heavily Republican.
        </p>
        <p>
          Both are highlighted now. Find them, and follow their trails from 2016 to 2026.
          Where are they headed?
        </p>
      </>
    ),
  },
  {
    chartType: "ternary",
    highlights: ["Denver", "Rio Blanco"],
    headline: "Did major party affiliations shift toward the center — or the extremes?",
    body: (
      <>
        <p>
          Look at the horizontal movement of Denver and Rio Blanco's trails. Denver sits
          left (heavily Democratic), Rio Blanco sits right (heavily Republican).
        </p>
        <p className="va-step-question">
          Did they drift toward each other over the decade, or further apart? In a ternary plot, it looks like they've been converging towards the center.
        </p>
      </>
    ),
  },
  {
    chartType: "cartesian",
    highlights: [],
    headline: "The same data, a different lens",
    body: (
      <>
        <p>
          This version collapses Democrat vs. Republican onto a single horizontal axis,
          and gives the vertical axis entirely to unaffiliated growth. That's a deliberate
          editorial choice and it can have consequences.
        </p>
        <p className="va-step-question">
          What do you notice first?
        </p>
      </>
    ),
  },
  {
    chartType: "cartesian",
    highlights: [],
    headline: "Every county is moving upward",
    body: (
      <>
        <p>
          The main story, people shifting towards unaffiliated status still announces itself clearly. 
          Every trail points up. Some steeply, some gradually — but upward.
        </p>
        <p>
          This insight feels similar to the ternary chart.
        </p>
      </>
    ),
  },
  {
    chartType: "cartesian",
    highlights: ["Denver", "Rio Blanco"],
    headline: "Denver and Rio Blanco, revisited",
    body: (
      <>
        <p>
          Here they are again. Both trails climb sharply upward — more unaffiliated voters
          in both places over the decade.
        </p>
        <p>
          Their horizontal positions tell a different story this time: Denver sits far left, Rio
          Blanco sits far right. Now look at where each trail starts versus where it ends.
        </p>
      </>
    ),
  },
  {
    chartType: "cartesian",
    highlights: ["Denver", "Rio Blanco"],
    headline: "Drifting apart?",
    body: (
      <>
        <p>
          Both counties drifted away from the center over the decade — a modest
          but real signal. This chart tells a story of increasing polarization that
          the ternary plot did not.
        </p>
        <p className="va-step-question">
          But... is this drift true? Is Denver really more left leaning or is it jus that center leaning voters are now less likely to affiliate?
        </p>
      </>
    ),
  },
  {
    chartType: "cartesian",
    highlights: [],
    headline: "So which chart is better?",
    body: (
      <>
        <p>
          Ternary plots hold three variables in visual equality — no party gets a
          privileged axis. (Though one could argue the apex of the triangle carries extra
          visual weight just by virtue of being the only lone corner.) That's a genuine
          virtue. The cost is an unfamiliar scale that most readers, myself included, find
          hard to read intuitively.
        </p>
        <p>
          The scatter plot requires editorial decisions: * 2 categories are held in balance with eachother and the 3rd category gets visual priority. 
          It gives up elegance for legibility.
        </p>
        <p className="va-step-question">
          What do you think?
        </p>
      </>
    ),
  },
];

export default function App() {
  const [data, setData] = useState<County[] | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  // Explorer section state
  const [explorerChartType, setExplorerChartType] = useState<"ternary" | "cartesian">("cartesian");
  const [explorerYear, setExplorerYear] = useState(2026);
  const [explorerView, setExplorerView] = useState<"state" | "counties">("counties");

  useEffect(() => {
    fetch("/data/co_voter_affiliation.json")
      .then((r) => r.json())
      .then(setData);
  }, []);

  useEffect(() => {
    if (!data) return;
    const handleScroll = () => {
      const steps = document.querySelectorAll<HTMLElement>(".va-scrolly-step");
      let best = 0;
      let bestRatio = -1;
      steps.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        const ratio = visible / rect.height;
        if (ratio > bestRatio) { bestRatio = ratio; best = i; }
      });
      setCurrentStep(best);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [data]);

  if (!data) return <div className="va-loading">Loading data…</div>;

  const storyStep = STORY_STEPS[currentStep] ?? STORY_STEPS[0];

  return (
    <div className="va-root">
      <header className="va-story-header">
        <h1 className="va-title">Exploring a ternary chart</h1>
        <p className="va-subtitle">
          Colorado voter registration, 2016–2026 — two ways to visualize a three-way split
        </p>
      </header>

      <div className="va-scrolly-container">
        <div className="va-scrolly-viz">
          <VoterChart
            data={data}
            chartType={storyStep.chartType}
            year={2026}
            view="counties"
            forcedHighlights={storyStep.highlights}
            interactive={false}
          />
        </div>

        <div className="va-scrolly-steps">
          {STORY_STEPS.map((step, i) => (
            <div
              key={i}
              className="va-scrolly-step"
              data-step={i}
            >
              <div className="va-step-inner">
                <div className="va-step-number">{i + 1} / {STORY_STEPS.length}</div>
                <h2 className="va-step-headline">{step.headline}</h2>
                <div className="va-step-body">{step.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <TernaryCartesianTranslator />

      <div className="va-explorer">
        <h2 className="va-explorer-title">Explore the data</h2>
        <p className="va-explorer-desc">
          Hover over counties to see their registration breakdown. Click to lock a county.
        </p>

        <div className="va-controls">
          <div className="va-toggle">
            <button
              className={`va-toggle-btn ${explorerChartType === "ternary" ? "active" : ""}`}
              onClick={() => setExplorerChartType("ternary")}
            >
              Ternary
            </button>
            <button
              className={`va-toggle-btn ${explorerChartType === "cartesian" ? "active" : ""}`}
              onClick={() => setExplorerChartType("cartesian")}
            >
              Scatter plot
            </button>
          </div>

          <div className="va-toggle">
            <button
              className={`va-toggle-btn ${explorerView === "counties" ? "active" : ""}`}
              onClick={() => setExplorerView("counties")}
            >
              By county
            </button>
            <button
              className={`va-toggle-btn ${explorerView === "state" ? "active" : ""}`}
              onClick={() => setExplorerView("state")}
            >
              Statewide
            </button>
          </div>

          <div className="va-year-control">
            <span className="va-year-label">
              Year: <strong>{explorerYear}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={YEARS.length - 1}
              value={YEARS.indexOf(explorerYear)}
              onChange={(e) => setExplorerYear(YEARS[+e.target.value])}
              className="va-slider"
            />
            <div className="va-year-ticks">
              {YEARS.map((y) => (
                <span
                  key={y}
                  className={`va-year-tick ${y === explorerYear ? "active" : ""}`}
                  onClick={() => setExplorerYear(y)}
                >
                  {y}
                </span>
              ))}
            </div>
          </div>
        </div>

        <VoterChart
          data={data}
          chartType={explorerChartType}
          year={explorerYear}
          view={explorerView}
          interactive={true}
        />

        <p className="va-footnote">
          Dot size proportional to total registered voters. Trails show each county's path
          from 2016 through {explorerYear}. "Unaffiliated" includes minor party registrants
          (Green, Libertarian, etc.).
          {explorerChartType === "ternary"
            ? " Ternary chart places each county at its barycentric position in Democrat / Republican / Unaffiliated space."
            : " Scatter plot collapses D/R onto a single axis so the vertical axis can be dedicated to unaffiliated growth."}
          {" "}Data: Colorado Secretary of State.
        </p>
      </div>
    </div>
  );
}
