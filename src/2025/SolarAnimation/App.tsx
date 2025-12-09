import { useState, useEffect, useRef } from "react";
import { useData } from "./useData";
import { DailyCurvesChart } from "./DailyCurvesChart";
import { YearOverviewChart } from "./YearOverviewChart";
import { PlayControls } from "./PlayControls";
import { StepOverlay } from "./StepOverlay";
import { StepControls } from "./StepControls";
import type { KeyDate } from "./types";
import "./App.css";

const ANIMATION_SPEED = 100; // milliseconds per day
const TOTAL_STEPS = 8;

export default function App() {
  const data = useData();
  const [step, setStep] = useState(0);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [permanentDays, setPermanentDays] = useState<Set<number>>(new Set());
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());

  // Find specific day indices
  const sunnyDayIndex = data?.daily_totals.findIndex((d) => d.date === "2024-06-21") ?? 0; // Summer solstice
  const cloudyDayIndex = data?.daily_totals.findIndex((d) => d.date === "2024-06-23") ?? 14; // A cloudy summer day (2 days after June 21)
  const minDayIndex = data?.daily_totals.findIndex(
    (d) => d.date === data?.key_dates.find((kd) => kd.label === "Minimum Generation Day")?.date
  ) ?? 21;
  const maxDayIndex = data?.daily_totals.findIndex(
    (d) => d.date === data?.key_dates.find((kd) => kd.label === "Peak Generation Day")?.date
  ) ?? 180;

  // Step-specific effects
  useEffect(() => {
    if (!data) return;

    switch (step) {
      case 1: // Show single sunny day
        setCurrentDayIndex(sunnyDayIndex);
        setPermanentDays(new Set());
        break;
      case 2: // Add cloudy day
        setCurrentDayIndex(cloudyDayIndex);
        setPermanentDays(new Set([sunnyDayIndex]));
        break;
      case 3: // Show yearly pattern
        const june25Index = sunnyDayIndex + 4;
        setCurrentDayIndex(june25Index); // June 25 (4 days after June 21)
        setPermanentDays(new Set()); // No permanent days - focus on the timeline
        break;
      case 4: // Jump to minimum day
        setCurrentDayIndex(minDayIndex);
        setPermanentDays(new Set([minDayIndex]));
        break;
      case 5: // Jump to maximum day
        setCurrentDayIndex(maxDayIndex);
        setPermanentDays(new Set([minDayIndex, maxDayIndex]));
        break;
      case 6: // Start full year animation
        setCurrentDayIndex(0);
        setPermanentDays(new Set());
        setIsPlaying(true);
        break;
      case 7: // Free exploration mode
        setIsPlaying(false);
        break;
    }
  }, [step, data, sunnyDayIndex, cloudyDayIndex, minDayIndex, maxDayIndex]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !data || step !== 6) return;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastUpdateTimeRef.current;

      if (elapsed >= ANIMATION_SPEED) {
        setCurrentDayIndex((prev) => {
          const nextDayIndex = prev + 1;
          if (nextDayIndex < data.metadata.total_days) {
            // Check for key dates
            const nextDate = data.daily_totals[nextDayIndex].date;
            const keyDate = data.key_dates.find(
              (kd) =>
                kd.date === nextDate &&
                (kd.label === "Peak Generation Day" ||
                  kd.label === "Minimum Generation Day")
            );

            if (keyDate) {
              setPermanentDays((prev) => new Set(prev).add(nextDayIndex));
            }

            return nextDayIndex;
          } else {
            // Animation complete, move to final step
            setIsPlaying(false);
            setStep(7);
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
  }, [isPlaying, data, step]);

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

  const handleTimelineHover = (dayIndex: number | null) => {
    if (step === 7) {
      setHoveredDayIndex(dayIndex);
    }
  };

  const handleTimelineClick = (dayIndex: number) => {
    if (step === 7) {
      setPermanentDays((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(dayIndex)) {
          newSet.delete(dayIndex);
        } else {
          newSet.add(dayIndex);
        }
        return newSet;
      });
    }
  };

  if (!data) {
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
        Loading solar data...
      </div>
    );
  }

  const trailingDays = step === 3 ? 7 : 0; // Only show trailing days on step 3 (4/8)
  const width = 1000;
  const curvesHeight = 400;
  const overviewHeight = 150;
  const curvesMargin = { top: 40, right: 40, bottom: 60, left: 80 };
  const overviewMargin = { top: 20, right: 40, bottom: 40, left: 80 };

  const dates = data.daily_totals.map((d) => d.date);
  const displayDayIndex = hoveredDayIndex ?? currentDayIndex;
  const currentDate = dates[displayDayIndex];

  const currentKeyDate: KeyDate | null =
    data.key_dates.find(
      (kd) =>
        kd.date === data.daily_totals[currentDayIndex]?.date &&
        (kd.label === "Peak Generation Day" ||
          kd.label === "Minimum Generation Day")
    ) || null;

  const showOverview = step >= 3;
  const showPlayControls = step === 6;

  return (
    <div className="solar-animation-container">
      {/* Step overlay/instructions - always at the top */}
      {step === 0 && (
        <div style={{ marginBottom: "40px" }}>
          <StepOverlay step={step} onBegin={handleNext} />
        </div>
      )}

      {step > 0 && step < 7 && (
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

      {step === 7 && (
        <div
          style={{
            textAlign: "center",
            marginBottom: "40px",
            color: "#666",
            fontSize: "16px",
          }}
        >
          <strong>Explore:</strong> Hover over the timeline to see any day. Click to pin days for comparison.
        </div>
      )}

      {/* Navigation controls - above the charts */}
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
          currentDate={currentDate}
          keyDateInfo={currentKeyDate}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
        <svg width={width} height={curvesHeight}>
          <DailyCurvesChart
            currentDayIndex={step === 3 ? -1 : displayDayIndex}
            trailingDays={trailingDays}
            permanentDays={step === 3 ? new Set() : permanentDays}
            curves={data.intraday_curves}
            dates={dates}
            width={width}
            height={curvesHeight}
            margin={curvesMargin}
          />
        </svg>

        {showOverview && (
          <svg width={width} height={overviewHeight}>
            <YearOverviewChart
              dailyTotals={data.daily_totals}
              currentDayIndex={currentDayIndex}
              hoveredDayIndex={hoveredDayIndex}
              width={width}
              height={overviewHeight}
              margin={overviewMargin}
              onHover={handleTimelineHover}
              onClick={handleTimelineClick}
              interactive={step === 7}
              showCurrentDay={step !== 3 && step !== 7}
            />
          </svg>
        )}
      </div>

      {step === 7 && permanentDays.size > 0 && (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button
            onClick={() => setPermanentDays(new Set())}
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
            Clear All Pinned Days
          </button>
        </div>
      )}

      {step === 7 && (
        <div
          style={{
            marginTop: "40px",
            padding: "20px",
            borderTop: "1px solid #ddd",
            textAlign: "center",
          }}
        >
          <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#888" }}>
            <strong>Data Sources:</strong>
          </p>
          <p style={{ margin: "0", fontSize: "11px", color: "#999", lineHeight: "1.6" }}>
            Solar generation data from{" "}
            <a
              href="https://www.caiso.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#ff8c00" }}
            >
              CAISO
            </a>{" "}
            (California Independent System Operator) via{" "}
            <a
              href="https://github.com/kmax12/gridstatus"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#ff8c00" }}
            >
              GridStatus
            </a>
            . Solar irradiance data from NREL's{" "}
            <a
              href="https://nsrdb.nrel.gov/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#ff8c00" }}
            >
              NSRDB
            </a>{" "}
            (National Solar Radiation Database).
          </p>
        </div>
      )}
    </div>
  );
}
