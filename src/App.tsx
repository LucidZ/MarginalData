import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import AboutPage from "./pages/AboutPage";
import LoadingSpinner from "./components/LoadingSpinner";
import NotFound from "./pages/NotFound";
import UmamiPageTracker from "./components/UmamiPageTracker";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { ROUTES } from "./routes";

// I-70 sketches, deliberately not in ROUTES: every ROUTES entry lands on the
// homepage feed. /2026/I70Widgets is the index that links them all.
const I70Crossfilter = lazy(() => import("./2026/I70Crossfilter"));
const I70Traffic = lazy(() => import("./2026/I70Traffic"));
const I70Widgets = lazy(() => import("./2026/I70Widgets"));
const I70FlowVsSpeed = lazy(() => import("./2026/I70Widgets/FlowVsSpeed"));
const I70TwoCounters = lazy(() => import("./2026/I70Widgets/TwoCounters"));

// Hoisted to module scope so lazy() is only called once per route, not on every render.
const lazyRoutes = ROUTES.map((route) => ({
  path: route.path,
  Component: lazy(route.component),
}));

function App() {
  return (
    <Router>
      <UmamiPageTracker />
      <Header />
      <main className="site-main">
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/2026/I70Crossfilter" element={<I70Crossfilter />} />
            <Route path="/2026/I70Traffic" element={<I70Traffic />} />
            <Route path="/2026/I70Widgets" element={<I70Widgets />} />
            <Route path="/2026/I70Widgets/FlowVsSpeed" element={<I70FlowVsSpeed />} />
            <Route path="/2026/I70Widgets/TwoCounters" element={<I70TwoCounters />} />
            {lazyRoutes.map(({ path, Component }) => (
              <Route key={path} path={path} element={<Component />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </Router>
  );
}

export default App;
