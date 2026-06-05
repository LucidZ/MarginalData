import { Suspense, lazy } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoadingSpinner from "./components/LoadingSpinner";
import NotFound from "./pages/NotFound";

// Dynamically import project components
const USAIDSize = lazy(() => import("./2025/USAIDSize"));
const ForeignAid = lazy(() => import("./2025/ForeignAid"));
const FederalEmployment = lazy(() => import("./2025/FederalEmployment"));
const FuelEconomyTool = lazy(() => import("./2025/FuelEconomyTool"));
const FuelEconomyCurve = lazy(() => import("./2025/FuelEconomyCurve"));
const PizzaAreaComparison = lazy(() => import("./2025/PizzaAreaComparison"));
const SolarAnimation = lazy(() => import("./2025/SolarAnimation"));
const ImageScrambler = lazy(() => import("./2025/ImageScrambler"));
const DecisionVectorizer = lazy(() => import("./2025/DecisionVectorizer"));
const DecisionComponentAnalyzer = lazy(() => import("./2025/DecisionComponentAnalyzer"));
const HowMany13ers = lazy(() => import("./2025/HowMany13ers"));
const SpaceTraveler = lazy(() => import("./2025/SpaceTraveler"));
const MarginalTax = lazy(() => import("./financial-literacy/MarginalTax"));
const TheNet = lazy(() => import("./financial-literacy/TheNet"));
const TheCushion = lazy(() => import("./financial-literacy/TheCushion"));
const TheCompound = lazy(() => import("./financial-literacy/TheCompound"));
const BudgetDeciles = lazy(() => import("./financial-literacy/BudgetDeciles"));
const ChessboardRice = lazy(() => import("./2025/ChessboardRice"));

function App() {
  return (
    <Router>
      <main className="container">
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/2025/USAIDSize" element={<USAIDSize />} />
            <Route path="/2025/ForeignAid" element={<ForeignAid />} />
            <Route
              path="/2025/FederalEmployment"
              element={<FederalEmployment />}
            />
            <Route path="/2025/FuelEconomyTool" element={<FuelEconomyTool />} />
            <Route path="/2025/FuelEconomyCurve" element={<FuelEconomyCurve />} />
            <Route path="/2025/PizzaAreaComparison" element={<PizzaAreaComparison />} />
            <Route path="/2025/SolarAnimation" element={<SolarAnimation />} />
            <Route path="/2025/ImageScrambler" element={<ImageScrambler />} />
            <Route path="/2025/DecisionVectorizer" element={<DecisionVectorizer />} />
            <Route path="/2025/DecisionComponentAnalyzer" element={<DecisionComponentAnalyzer />} />
            <Route path="/2025/HowMany13ers" element={<HowMany13ers />} />
            <Route path="/2025/SpaceTraveler" element={<SpaceTraveler />} />
            <Route path="/financial-literacy/marginal-tax" element={<MarginalTax />} />
            <Route path="/financial-literacy/the-net" element={<TheNet />} />
            <Route path="/financial-literacy/the-cushion" element={<TheCushion />} />
            <Route path="/financial-literacy/the-compound" element={<TheCompound />} />
            <Route path="/financial-literacy/budget-deciles" element={<BudgetDeciles />} />
            <Route path="/2025/ChessboardRice" element={<ChessboardRice />} />
            {/* Add more projects here */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </Router>
  );
}

export default App;
