import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoadingSpinner from "./components/LoadingSpinner";
import NotFound from "./pages/NotFound";

// Dynamically import project components
const USAIDSize = lazy(() => import("./2025/USAIDSize"));

function App() {
  return (
    <Router>
      <main className="container">
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/2025/USAIDSize" element={<USAIDSize />} />
            {/* Add more projects here */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </Router>
  );
}

export default App;
