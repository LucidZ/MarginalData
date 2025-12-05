import { useState, useEffect, useRef } from "react";
import { useData } from "./useData";
import { DailyCurvesChart } from "./DailyCurvesChart";
import { YearOverviewChart } from "./YearOverviewChart";
import { PlayControls } from "./PlayControls";
import type { KeyDate } from "./types";
import "./App.css";

const ANIMATION_SPEED = 100; // milliseconds per day

export default function App() {
  const data = useData();
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [permanentDays, setPermanentDays] = useState<Set<number>>(new Set());
  const [displayedKeyDates, setDisplayedKeyDates] = useState<Set<string>>(new Set());
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());

  // Check if current day is a key date (only peak and min)
  const currentKeyDate: KeyDate | null =
    data?.key_dates.find(
      (kd) =>
        kd.date === data.daily_totals[currentDayIndex]?.date &&
        (kd.label === "Peak Generation Day" ||
          kd.label === "Minimum Generation Day")
    ) || null;

  // Animation loop using requestAnimationFrame
  useEffect(() => {
    if (!isPlaying || !data) return;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastUpdateTimeRef.current;

      if (elapsed >= ANIMATION_SPEED) {
        setCurrentDayIndex((prev) => {
          const nextDayIndex = prev + 1;
          if (nextDayIndex < data.metadata.total_days) {
            // Check if this is a key date (peak or min) and add to permanent set
            const nextDate = data.daily_totals[nextDayIndex].date;
            const keyDate = data.key_dates.find(
              (kd) =>
                kd.date === nextDate &&
                (kd.label === "Peak Generation Day" ||
                  kd.label === "Minimum Generation Day")
            );

            if (keyDate) {
              setPermanentDays((prev) => new Set(prev).add(nextDayIndex));
              setDisplayedKeyDates((prev) => new Set(prev).add(keyDate.label));
            }

            return nextDayIndex;
          } else {
            // Reached end
            setIsPlaying(false);
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
  }, [isPlaying, data]);

  const handlePlayPause = () => {
    if (!isPlaying && currentDayIndex >= (data?.metadata.total_days || 1) - 1) {
      // Reset if at end
      setCurrentDayIndex(0);
      setPermanentDays(new Set());
      setDisplayedKeyDates(new Set());
    }

    lastUpdateTimeRef.current = Date.now();
    setIsPlaying(!isPlaying);
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

  const trailingDays = 7;

  // Chart dimensions
  const width = 1000;
  const curvesHeight = 400;
  const overviewHeight = 150;

  const curvesMargin = { top: 40, right: 40, bottom: 60, left: 80 };
  const overviewMargin = { top: 20, right: 40, bottom: 40, left: 80 };

  const dates = data.daily_totals.map((d) => d.date);
  const currentDate = dates[currentDayIndex];

  return (
    <div className="solar-animation-container">
      <h1
        style={{
          textAlign: "center",
          color: "#333",
          marginBottom: "10px",
        }}
      >
        California Solar Generation 2024
      </h1>
      <p
        style={{
          textAlign: "center",
          color: "#666",
          marginBottom: "30px",
          fontSize: "14px",
        }}
      >
        Explore how solar generation varies throughout the year
      </p>

      <PlayControls
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        currentDate={currentDate}
        keyDateInfo={currentKeyDate}
      />

      {/* Key date text overlays - simple text without background */}
      <div style={{ position: "relative", minHeight: "60px" }}>
        {data.key_dates
          .filter(
            (kd) =>
              displayedKeyDates.has(kd.label) &&
              (kd.label === "Peak Generation Day" ||
                kd.label === "Minimum Generation Day")
          )
          .map((kd, index) => (
            <div
              key={kd.label}
              style={{
                textAlign: "center",
                color: "#666",
                fontSize: "13px",
                marginTop: index === 0 ? "0" : "8px",
                lineHeight: "1.5",
              }}
            >
              <strong style={{ color: "#e74c3c" }}>
                {kd.label} ({new Date(kd.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })})
              </strong>
              : {kd.commentary}
            </div>
          ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
        {/* Daily Curves Chart (Top) */}
        <svg width={width} height={curvesHeight}>
          <DailyCurvesChart
            currentDayIndex={currentDayIndex}
            trailingDays={trailingDays}
            permanentDays={permanentDays}
            curves={data.intraday_curves}
            dates={dates}
            width={width}
            height={curvesHeight}
            margin={curvesMargin}
          />
        </svg>

        {/* Year Overview Chart (Bottom) */}
        <svg width={width} height={overviewHeight}>
          <YearOverviewChart
            dailyTotals={data.daily_totals}
            currentDayIndex={currentDayIndex}
            width={width}
            height={overviewHeight}
            margin={overviewMargin}
          />
        </svg>
      </div>

      {/* Sources */}
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
    </div>
  );
}
