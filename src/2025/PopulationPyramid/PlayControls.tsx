interface PlayControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  currentYear: number;
}

export const PlayControls = ({
  isPlaying,
  onPlayPause,
  currentYear,
}: PlayControlsProps) => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "20px",
        padding: "20px",
        marginBottom: "20px",
      }}
    >
      <button
        onClick={onPlayPause}
        style={{
          fontSize: "18px",
          padding: "12px 32px",
          backgroundColor: isPlaying ? "#f44336" : "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontWeight: "bold",
          transition: "background-color 0.2s",
          minWidth: "120px",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = isPlaying
            ? "#da190b"
            : "#45a049";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = isPlaying
            ? "#f44336"
            : "#4CAF50";
        }}
      >
        {isPlaying ? "⏸ Pause" : "▶ Play"}
      </button>

      <div
        style={{
          fontSize: "24px",
          fontWeight: "bold",
          color: "#333",
          minWidth: "80px",
          textAlign: "center",
        }}
      >
        {currentYear}
      </div>
    </div>
  );
};
