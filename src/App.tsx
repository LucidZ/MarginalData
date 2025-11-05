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
            {/* Add more projects here */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </Router>
  );
}

export default App;
