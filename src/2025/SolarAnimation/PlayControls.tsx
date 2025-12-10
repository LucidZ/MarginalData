import type { KeyDate } from "./types";

interface PlayControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  currentDate: string;
  keyDateInfo: KeyDate | null;
}

export const PlayControls = ({
  isPlaying,
  onPlayPause,
  currentDate,
  keyDateInfo,
}: PlayControlsProps) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "20px",
        padding: "20px",
      }}
    >
      {/* Play/Pause Button */}
      <button
        onClick={onPlayPause}
        style={{
          fontSize: "18px",
          padding: "12px 32px",
          backgroundColor: "#ff8c00",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontWeight: "bold",
          transition: "background-color 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#e67e00";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#ff8c00";
        }}
      >
        {isPlaying ? "⏸ Pause" : "▶ Play"}
      </button>

      {/* Current Date Display */}
      <div
        style={{
          fontSize: "16px",
          color: "#666",
          fontWeight: "500",
        }}
      >
        {new Date(currentDate).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </div>

    </div>
  );
};
