interface AnimationControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  progress: number; // 0 to 1
  onProgressChange: (progress: number) => void;
}

export default function AnimationControls({
  isPlaying,
  onPlayPause,
  onReset,
  speed,
  onSpeedChange,
  progress,
  onProgressChange,
}: AnimationControlsProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "20px",
        padding: "20px",
        backgroundColor: "#111",
        borderRadius: "8px",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={onPlayPause}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            backgroundColor: isPlaying ? "#E27B58" : "#4A90E2",
            color: "#FFF",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>

        <button
          onClick={onReset}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            backgroundColor: "#666",
            color: "#FFF",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          ⟲ Reset
        </button>
      </div>

      <div style={{ flex: "1", minWidth: "200px" }}>
        <label
          htmlFor="speed"
          style={{ display: "block", marginBottom: "8px", color: "#CCC" }}
        >
          Animation Speed: {speed} hrs/sec
        </label>
        <input
          id="speed"
          type="range"
          min="1"
          max="24"
          step="1"
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          style={{
            width: "100%",
            height: "8px",
            borderRadius: "4px",
            outline: "none",
            cursor: "pointer",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "#888",
            marginTop: "4px",
          }}
        >
          <span>1 hr/s</span>
          <span>24 hrs/s (1 day/s)</span>
        </div>
      </div>

      <div style={{ flex: "1", minWidth: "200px" }}>
        <label
          htmlFor="timeline"
          style={{
            display: "block",
            fontSize: "12px",
            color: "#CCC",
            marginBottom: "8px",
          }}
        >
          Timeline: {(progress * 100).toFixed(1)}%
        </label>
        <input
          id="timeline"
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={progress * 100}
          onChange={(e) => onProgressChange(parseFloat(e.target.value) / 100)}
          style={{
            width: "100%",
            height: "8px",
            borderRadius: "4px",
            outline: "none",
            cursor: "pointer",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "#888",
            marginTop: "4px",
          }}
        >
          <span>Start</span>
          <span>End</span>
        </div>
      </div>
    </div>
  );
}
