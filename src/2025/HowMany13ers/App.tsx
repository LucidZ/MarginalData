import { lazy, Suspense } from "react";
import { useControls } from "leva";
import "./App.css";

// Lazy load the 3D scene to avoid loading Three.js on the homepage
const TerrainScene = lazy(() => import("./TerrainScene"));

export default function HowMany13ers() {
  const { exaggeration, highlightElevation, elevationThreshold } = useControls({
    exaggeration: {
      value: 2.0,
      min: 0.5,
      max: 10.0,
      step: 0.1,
      label: "Vertical Exaggeration",
    },
    highlightElevation: {
      value: 13879,
      min: 8000,
      max: 14500,
      step: 1,
      label: "Highlight Elevation (ft)",
    },
    elevationThreshold: {
      value: 12000,
      min: 8000,
      max: 14500,
      step: 100,
      label: "Green Above (ft)",
    },
  });

  return (
    <div className="thirteeners-tool">
      <header>
        <h1>How Many 13.879ers?</h1>
        <p className="subtitle">
          Exploring the arbitrary nature of peak classifications
        </p>
        <p className="intro-text">
          Colorado is famous for its "14ers" - peaks above 14,000 feet. But what
          if we cared about 13.879ers instead? This interactive 3D map lets you
          explore how many peaks qualify at different elevation thresholds,
          highlighting the somewhat arbitrary nature of our classification systems.
        </p>
      </header>

      <div className="controls-hint">
        <p>
          Use the controls in the top-right to adjust the elevation threshold
          and highlight specific heights. Drag to rotate, scroll to zoom.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="loading-container">
            <div className="loading-spinner">Loading terrain data...</div>
          </div>
        }
      >
        <TerrainScene
          exaggeration={exaggeration}
          highlightElevation={highlightElevation}
          elevationThreshold={elevationThreshold}
        />
      </Suspense>

      <footer className="tool-footer">
        <div className="insight-tip">
          <p style={{ fontStyle: "italic", marginBottom: "0.5rem" }}>
            <strong>Did you know?</strong> The distinction between a 13er and a
            14er is just 121 feet - about the height of a 10-story building.
          </p>
          <p style={{ fontStyle: "italic" }}>
            Try adjusting the "Green Above" slider to see how dramatically the
            landscape changes with small elevation differences.
          </p>
        </div>
        <p style={{ marginTop: "1.5rem", fontSize: "0.9rem" }}>
          Terrain visualization uses procedural generation inspired by
          Colorado's topography
        </p>
      </footer>
    </div>
  );
}
