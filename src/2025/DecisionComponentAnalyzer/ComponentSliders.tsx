import { useRef, useState } from "react";
import { ComparisonRow } from "./App";

interface ComponentSlidersProps {
  optionAName: string;
  optionBName: string;
  rows: ComparisonRow[];
  updateSliderData: (
    id: string,
    joyA: number,
    joyB: number,
    valueA: number,
    valueB: number
  ) => void;
}

interface DragState {
  isDragging: boolean;
  rowId: string | null;
  sliderType: "joy" | "value" | null;
  markerType: "a" | "b" | null;
}

export default function ComponentSliders({
  optionAName,
  optionBName,
  rows,
  updateSliderData,
}: ComponentSlidersProps) {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    rowId: null,
    sliderType: null,
    markerType: null,
  });
  const sliderRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const getSliderValue = (e: React.PointerEvent, sliderEl: HTMLDivElement): number => {
    const rect = sliderEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const value = Math.max(0, Math.min(1, x / rect.width));
    return value;
  };

  const handlePointerDown = (
    e: React.PointerEvent,
    rowId: string,
    sliderType: "joy" | "value",
    markerType: "a" | "b"
  ) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({ isDragging: true, rowId, sliderType, markerType });
  };

  const handlePointerMove = (e: React.PointerEvent, rowId: string, sliderType: "joy" | "value") => {
    if (!dragState.isDragging || dragState.rowId !== rowId || dragState.sliderType !== sliderType) return;

    const sliderEl = sliderRefs.current.get(`${rowId}-${sliderType}`);
    if (!sliderEl) return;

    const newValue = getSliderValue(e, sliderEl);
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;

    const currentJoyA = row.sliderData?.joyA ?? 0.5;
    const currentJoyB = row.sliderData?.joyB ?? 0.5;
    const currentValueA = row.sliderData?.valueA ?? 0.5;
    const currentValueB = row.sliderData?.valueB ?? 0.5;

    if (sliderType === "joy") {
      if (dragState.markerType === "a") {
        updateSliderData(rowId, newValue, currentJoyB, currentValueA, currentValueB);
      } else {
        updateSliderData(rowId, currentJoyA, newValue, currentValueA, currentValueB);
      }
    } else {
      if (dragState.markerType === "a") {
        updateSliderData(rowId, currentJoyA, currentJoyB, newValue, currentValueB);
      } else {
        updateSliderData(rowId, currentJoyA, currentJoyB, currentValueA, newValue);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState.isDragging) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setDragState({ isDragging: false, rowId: null, sliderType: null, markerType: null });
    }
  };

  return (
    <div className="component-sliders">
      <h2>Rate Each Component</h2>
      <p className="step-description">
        For each category, position the markers to show how each option feels and its importance
      </p>

      {/* Joy/Feeling Section */}
      <div className="slider-section">
        <h3 className="slider-section-title">How does it make you feel?</h3>
        <div className="slider-axis-labels">
          <span>Ugh!</span>
          <span>Sparks Joy!</span>
        </div>

        {rows.map((row) => {
          const joyA = row.sliderData?.joyA ?? 0.5;
          const joyB = row.sliderData?.joyB ?? 0.5;

          return (
            <div key={`joy-${row.id}`} className="slider-row">
              <div className="slider-label">{row.category || "Untitled"}</div>
              <div
                className="slider-track"
                ref={(el) => {
                  if (el) sliderRefs.current.set(`${row.id}-joy`, el);
                }}
                onPointerMove={(e) => handlePointerMove(e, row.id, "joy")}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <div className="slider-line"></div>
                {/* Tick marks for joy slider */}
                <div className="slider-tick" style={{ left: "25%" }}></div>
                <div className="slider-tick slider-tick-middle" style={{ left: "50%" }}>
                  <span className="tick-label">Neutral</span>
                </div>
                <div className="slider-tick" style={{ left: "75%" }}></div>
                <div
                  className="slider-marker marker-a"
                  style={{ left: `${joyA * 100}%` }}
                  onPointerDown={(e) => handlePointerDown(e, row.id, "joy", "a")}
                >
                  <div className="marker-label">{optionAName || "A"}</div>
                </div>
                <div
                  className="slider-marker marker-b"
                  style={{ left: `${joyB * 100}%` }}
                  onPointerDown={(e) => handlePointerDown(e, row.id, "joy", "b")}
                >
                  <div className="marker-label">{optionBName || "B"}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Value/Importance Section */}
      <div className="slider-section">
        <h3 className="slider-section-title">How valuable/important is this factor?</h3>
        <div className="slider-axis-labels">
          <span>Low Value</span>
          <span>High Value</span>
        </div>

        {rows.map((row) => {
          const valueA = row.sliderData?.valueA ?? 0.5;
          const valueB = row.sliderData?.valueB ?? 0.5;

          return (
            <div key={`value-${row.id}`} className="slider-row">
              <div className="slider-label">{row.category || "Untitled"}</div>
              <div
                className="slider-track"
                ref={(el) => {
                  if (el) sliderRefs.current.set(`${row.id}-value`, el);
                }}
                onPointerMove={(e) => handlePointerMove(e, row.id, "value")}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <div className="slider-line"></div>
                {/* Tick marks for value slider */}
                <div className="slider-tick" style={{ left: "25%" }}></div>
                <div className="slider-tick slider-tick-middle" style={{ left: "50%" }}></div>
                <div className="slider-tick" style={{ left: "75%" }}></div>
                <div
                  className="slider-marker marker-a"
                  style={{ left: `${valueA * 100}%` }}
                  onPointerDown={(e) => handlePointerDown(e, row.id, "value", "a")}
                >
                  <div className="marker-label">{optionAName || "A"}</div>
                </div>
                <div
                  className="slider-marker marker-b"
                  style={{ left: `${valueB * 100}%` }}
                  onPointerDown={(e) => handlePointerDown(e, row.id, "value", "b")}
                >
                  <div className="marker-label">{optionBName || "B"}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
