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
