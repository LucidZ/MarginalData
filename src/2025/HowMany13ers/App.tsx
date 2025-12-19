import { useState, useMemo, lazy, Suspense, useEffect } from "react";
import SummitTable from "./SummitTable";
import FilterControls from "./FilterControls";
import ElevationHistogram from "./ElevationHistogram";
import summitsData from "./data/all-colorado-summits.json";

// Lazy load the map component to avoid loading Leaflet on initial page load
const ColoradoMap = lazy(() => import("./ColoradoMap"));

const useResponsiveDimensions = () => {
  const [dimensions, setDimensions] = useState({
    histogramWidth: 200,
    histogramHeight: 600,
  });

  useEffect(() => {
    const updateDimensions = () => {
      // Account for container padding (20px each side) + gap (10px)
      const containerPadding = 40;
      const gapSize = 10;

      // Use the longer dimension as width to encourage landscape orientation
      const screenWidth = Math.max(window.innerWidth, window.innerHeight);
      const screenHeight = Math.min(window.innerWidth, window.innerHeight);

      const availableWidth = screenWidth - containerPadding - gapSize;
      const availableHeight = screenHeight * 0.8;

      // For mobile landscape (horizontal), use 1/4 for histogram width
      const histogramWidth = Math.min(availableWidth * 0.25, 200);
      const histogramHeight = Math.min(availableHeight, 600);

      setDimensions({
        histogramWidth,
        histogramHeight,
      });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  return dimensions;
};

interface Summit {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    name: string;
    elevation: number;
    elevationMeters: number;
    county: string;
    featureId: string;
    mapName: string;
  };
}

interface SummitsGeoJSON {
  type: string;
  features: Summit[];
}

const data = summitsData as SummitsGeoJSON;

function App() {
  const [minElevation, setMinElevation] = useState(13000);
  const [maxElevation, setMaxElevation] = useState(14000);
  const [searchTerm, setSearchTerm] = useState("");
  const [isPortrait, setIsPortrait] = useState(
    window.innerHeight > window.innerWidth
  );
  const { histogramWidth, histogramHeight } = useResponsiveDimensions();

  // Check for portrait orientation and handle significant resizes
  useEffect(() => {
    let resizeTimeout: number;
    const initialWidth = window.innerWidth;
    const initialHeight = window.innerHeight;

    const handleOrientationCheck = () => {
      const newIsPortrait = window.innerHeight > window.innerWidth;
      setIsPortrait(newIsPortrait);

      // If window size changed significantly (more than 20%), reload after a delay
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        const widthChange = Math.abs(window.innerWidth - initialWidth) / initialWidth;
        const heightChange = Math.abs(window.innerHeight - initialHeight) / initialHeight;

        if (widthChange > 0.2 || heightChange > 0.2) {
          window.location.reload();
        }
      }, 500); // Wait 500ms after resize stops
    };

    window.addEventListener("resize", handleOrientationCheck);
    return () => {
      window.removeEventListener("resize", handleOrientationCheck);
      clearTimeout(resizeTimeout);
    };
  }, []);

  const filteredSummits = useMemo(() => {
    return data.features.filter((summit) => {
      const elevation = summit.properties.elevation;
      const name = summit.properties.name.toLowerCase();

      const meetsElevation =
        elevation >= minElevation && elevation <= maxElevation;
      const meetsSearch =
        searchTerm === "" || name.includes(searchTerm.toLowerCase());

      return meetsElevation && meetsSearch;
    });
  }, [minElevation, maxElevation, searchTerm]);

  const { elevationExtent, allElevations } = useMemo(() => {
    const elevations = data.features.map((s) => s.properties.elevation);
    return {
      elevationExtent: [Math.min(...elevations), Math.max(...elevations)] as [
        number,
        number
      ],
      allElevations: elevations,
    };
  }, []);

  // Show rotate screen message if in portrait mode
  if (isPortrait) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#000",
          color: "#fff",
          fontSize: "24px",
          textAlign: "center",
          padding: "20px",
        }}
      >
        <div>
          <div style={{ fontSize: "48px", marginBottom: "20px" }}>📱 ↻</div>
          <div>Please rotate your device to landscape mode</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "10px", maxWidth: "800px" }}>
        How Many 13ers? Colorado Peaks Explorer
      </h1>
      <p style={{ marginBottom: "30px", color: "#666", lineHeight: "1.6", maxWidth: "800px" }}>
        Coloradoans are obsessed with 14ers (mountains over 14,000 feet tall)...
        but what about 13ers? Or 12ers? Use the interactive histogram on the left
        to explore all {data.features.length.toLocaleString()} named peaks in Colorado.
        Drag the blue handles to adjust the elevation range and discover how many peaks
        fall within different elevation bands. Currently showing{" "}
        {filteredSummits.length.toLocaleString()} peaks.
      </p>

      <div>
        <h2>Map View</h2>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <div style={{ flexShrink: 0 }}>
            <ElevationHistogram
              elevations={allElevations}
              minElevation={minElevation}
              maxElevation={maxElevation}
              setMinElevation={setMinElevation}
              setMaxElevation={setMaxElevation}
              elevationExtent={elevationExtent}
              width={histogramWidth}
              height={histogramHeight}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Suspense
              fallback={
                <div style={{ padding: "40px", textAlign: "center" }}>
                  Loading map...
                </div>
              }
            >
              <ColoradoMap summits={filteredSummits} height={histogramHeight} />
            </Suspense>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "30px" }}>
        <FilterControls searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      </div>

      <div style={{ marginTop: "40px" }}>
        <h2>Summit List</h2>
        <SummitTable summits={filteredSummits} />
      </div>

      <div
        style={{
          marginTop: "40px",
          padding: "20px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          fontSize: "14px",
          lineHeight: "1.6",
          color: "#555",
        }}
      >
        <h3 style={{ marginTop: 0, fontSize: "16px", color: "#333" }}>
          About the Data
        </h3>
        <p style={{ margin: "10px 0" }}>
          <strong>Peak Names:</strong> Geographic Names Information System
          (GNIS), U.S. Geological Survey
        </p>
        <p style={{ margin: "10px 0" }}>
          <strong>Elevation Data:</strong> USGS Elevation Point Query Service
          using 1/3 arc-second resolution (~10 meter) digital elevation models
        </p>
        <p style={{ margin: "10px 0", fontStyle: "italic" }}>
          Note: Elevations may differ slightly from commonly reported values.
          The USGS data reflects the elevation at the latitude/longitude
          coordinates associated with each peak name in GNIS, which may not
          always precisely align with the true high point. Additionally,
          elevation measurements can vary depending on the data source, survey
          method, and when the measurement was taken.
        </p>
      </div>
    </div>
  );
}

export default App;
