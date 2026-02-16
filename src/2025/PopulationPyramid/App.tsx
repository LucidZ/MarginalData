import { useState, useEffect, useRef } from "react";
import { useData } from "./useData";
import { PopulationPyramidChart } from "./PopulationPyramidChart";
import { PlayControls } from "./PlayControls";
import { YearSlider } from "./YearSlider";
import { StepOverlay } from "./StepOverlay";
import { StepControls } from "./StepControls";
import type { HighlightedCohort } from "./types";
import "./App.css";

const ANIMATION_SPEED = 1000; // milliseconds per year
const TOTAL_STEPS = 7;

// Baby Boomer cohort definition (1946-1964)
const BABY_BOOMER_START = 1946;
const BABY_BOOMER_END = 1964;

const useResponsiveDimensions = () => {
  const [dimensions, setDimensions] = useState({
    width: 800,
    height: 600,
  });

  useEffect(() => {
    const updateDimensions = () => {
      const containerPadding = 40;
      const availableWidth = window.innerWidth - containerPadding;
      const availableHeight = window.innerHeight * 0.6;

      const maxWidth = 800;
      const maxHeight = 600;
      const minWidth = 320;
      const minHeight = 400;

      const finalWidth = Math.max(Math.min(availableWidth, maxWidth), minWidth);
      const scale = finalWidth / maxWidth;
      const finalHeight = Math.max(
        Math.min(maxHeight * scale, maxHeight),
        minHeight
      );

      setDimensions({
        width: finalWidth,
        height: finalHeight,
      });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  return dimensions;
};

const getResponsiveMargins = (width: number) => {
  const isMobile = width < 600;
  return {
    top: 40,
    right: isMobile ? 30 : 50,
    bottom: isMobile ? 40 : 50,
    left: isMobile ? 30 : 50,
  };
};

export default function App() {
  const { data, loading, error } = useData();
  const [step, setStep] = useState(0);
  const [currentYear, setCurrentYear] = useState(2025);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highlightedCohorts, setHighlightedCohorts] = useState<HighlightedCohort[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [targetYear, setTargetYear] = useState<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());

  const { width, height } = useResponsiveDimensions();
  const margin = getResponsiveMargins(width);

  const minYear = data?.[0]?.year ?? 2010;
  const maxYear = data?.[data.length - 1]?.year ?? 2100;

  // Helper function to animate to a target year
  const animateToYear = (target: number) => {
    setTargetYear(target);
    setIsTransitioning(true);
  };

  // Step-specific effects
  useEffect(() => {
    if (!data) return;

    switch (step) {
      case 1: // Show current year (2025)
        setCurrentYear(2025);
        setHighlightedCohorts([]);
        break;
      case 2: // Highlight Baby Boomers
        setCurrentYear(2025);
        // Create cohorts for baby boomers
        const babyBoomerCohorts: HighlightedCohort[] = [];
        for (let year = BABY_BOOMER_START; year <= BABY_BOOMER_END; year++) {
          babyBoomerCohorts.push({
            id: `boomer-${year}`,
            birthYear: year,
            color: "#FF8C00",
            label: "Baby Boomers",
          });
        }
        setHighlightedCohorts(babyBoomerCohorts);
        break;
      case 3: // Show aging - animate to 2050
        // Keep baby boomer highlighting
        const boomers: HighlightedCohort[] = [];
        for (let year = BABY_BOOMER_START; year <= BABY_BOOMER_END; year++) {
          boomers.push({
            id: `boomer-${year}`,
            birthYear: year,
            color: "#FF8C00",
            label: "Baby Boomers",
          });
        }
        setHighlightedCohorts(boomers);
        animateToYear(2050);
        break;
      case 4: // Animate to 2100
        setHighlightedCohorts([]);
        animateToYear(2100);
        break;
      case 5: // Start animation
        setCurrentYear(2010);
        setHighlightedCohorts([]);
        setIsPlaying(true);
        break;
      case 6: // Free exploration
        setIsPlaying(false);
        setHighlightedCohorts([]);
        break;
    }
  }, [step, data]);

  // Transition animation loop (for step jumps)
  useEffect(() => {
    if (!isTransitioning || targetYear === null || !data) return;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastUpdateTimeRef.current;

      if (elapsed >= 100) { // Fast transitions, 100ms per year
        setCurrentYear((prev) => {
          if (prev < targetYear) {
            return prev + 1;
          } else if (prev > targetYear) {
            return prev - 1;
          } else {
            // Reached target
            setIsTransitioning(false);
            setTargetYear(null);
            return prev;
          }
        });
        lastUpdateTimeRef.current = now;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isTransitioning, targetYear, data]);

  // Play animation loop (for step 5)
  useEffect(() => {
    if (!isPlaying || !data || step !== 5) return;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastUpdateTimeRef.current;

      if (elapsed >= ANIMATION_SPEED) {
        setCurrentYear((prev) => {
          const nextYear = prev + 1;
          if (nextYear <= maxYear) {
            return nextYear;
          } else {
            // Animation complete, move to final step
            setIsPlaying(false);
            setStep(6);
            return prev;
          }
        });
        lastUpdateTimeRef.current = now;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, data, step, maxYear]);

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
      setIsPlaying(false);
    }
  };

  const handleCohortClick = (birthYear: number) => {
    if (step !== 6) return; // Only allow in exploration mode

    setHighlightedCohorts((prev) => {
      const existing = prev.find((c) => c.birthYear === birthYear);
      if (existing) {
        // Remove if already highlighted
        return prev.filter((c) => c.birthYear !== birthYear);
      } else {
        // Add new cohort with a color
        const colors = ["#FF8C00", "#9C27B0", "#00BCD4", "#4CAF50", "#FFC107"];
        const color = colors[prev.length % colors.length];
        return [
          ...prev,
          {
            id: `cohort-${birthYear}`,
            birthYear,
            color,
            label: `Born ${birthYear}`,
          },
        ];
      }
    });
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          fontSize: "24px",
          color: "#666",
        }}
      >
        Loading population data...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          fontSize: "18px",
          color: "#f44336",
        }}
      >
        Error loading data: {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const showPlayControls = step === 5;
  const showSlider = step === 6;

  return (
    <div className="population-pyramid-container">
      {/* Step overlay/instructions */}
      {step >= 0 && step < 6 && (
        <div
          style={{
            position: "relative",
            minHeight: "60px",
            textAlign: "center",
            marginBottom: "40px",
          }}
        >
          <StepOverlay step={step} />
        </div>
      )}

      {step === 6 && (
        <div
          style={{
            textAlign: "center",
            marginBottom: "20px",
            color: "#666",
            fontSize: "clamp(14px, 3vw, 16px)",
          }}
        >
          <strong>Explore:</strong> Use the slider to change the year. Click on
          age bars to highlight and track birth cohorts over time.
        </div>
      )}

      {/* Navigation controls */}
      <StepControls
        step={step}
        totalSteps={TOTAL_STEPS}
        onNext={handleNext}
        onBack={handleBack}
      />

      {showPlayControls && (
        <PlayControls
          isPlaying={isPlaying}
          onPlayPause={() => setIsPlaying(!isPlaying)}
          currentYear={currentYear}
        />
      )}

      {!showPlayControls && !showSlider && (
        <div
          style={{
            textAlign: "center",
            marginBottom: "20px",
            fontSize: "24px",
            fontWeight: "bold",
            color: "#333",
          }}
        >
          {currentYear}
        </div>
      )}

      {/* Main visualization */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <PopulationPyramidChart
          data={data}
          currentYear={currentYear}
          width={width}
          height={height}
          margin={margin}
          highlightedCohorts={highlightedCohorts}
          onCohortClick={step === 6 ? handleCohortClick : undefined}
        />
      </div>

      {showSlider && (
        <YearSlider
          currentYear={currentYear}
          minYear={minYear}
          maxYear={maxYear}
          onChange={setCurrentYear}
        />
      )}

      {step === 6 && highlightedCohorts.length > 0 && (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <div style={{ marginBottom: "10px" }}>
            <strong>Highlighted Cohorts:</strong>
            {highlightedCohorts.map((cohort) => (
              <span
                key={cohort.id}
                style={{
                  display: "inline-block",
                  margin: "0 10px",
                  padding: "4px 12px",
                  backgroundColor: cohort.color,
                  color: "white",
                  borderRadius: "4px",
                  fontSize: "12px",
                }}
              >
                {cohort.label}
              </span>
            ))}
          </div>
          <button
            onClick={() => setHighlightedCohorts([])}
            style={{
              fontSize: "14px",
              padding: "8px 20px",
              backgroundColor: "#ddd",
              color: "#333",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            Clear All Highlights
          </button>
        </div>
      )}

      {step === 6 && (
        <div
          style={{
            marginTop: "40px",
            padding: "20px",
            borderTop: "1px solid #ddd",
            textAlign: "center",
          }}
        >
          <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#888" }}>
            <strong>Data Source:</strong>
          </p>
          <p
            style={{ margin: "0", fontSize: "11px", color: "#999", lineHeight: "1.6" }}
          >
            Population data from{" "}
            <a
              href="https://www.census.gov/programs-surveys/international-programs/about/idb.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#4CAF50" }}
            >
              US Census Bureau International Database
            </a>
            . Includes historical data (2010-2024) and projections (2025-2100).
          </p>
        </div>
      )}
    </div>
  );
}
