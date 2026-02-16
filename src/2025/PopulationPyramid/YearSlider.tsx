interface YearSliderProps {
  currentYear: number;
  minYear: number;
  maxYear: number;
  onChange: (year: number) => void;
  disabled?: boolean;
}

export const YearSlider = ({
  currentYear,
  minYear,
  maxYear,
  onChange,
  disabled = false,
}: YearSliderProps) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px",
        gap: "10px",
      }}
    >
      <div style={{ position: "relative", width: "min(600px, 90vw)" }}>
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={currentYear}
          onChange={(e) => onChange(parseInt(e.target.value))}
          disabled={disabled}
          style={{
            width: "100%",
            height: "8px",
            borderRadius: "4px",
            outline: "none",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        />
        {/* Year label above the slider thumb */}
        <div
          style={{
            position: "absolute",
            left: `${((currentYear - minYear) / (maxYear - minYear)) * 100}%`,
            top: "-35px",
            transform: "translateX(-50%)",
            backgroundColor: "#4CAF50",
            color: "white",
            padding: "4px 12px",
            borderRadius: "4px",
            fontSize: "14px",
            fontWeight: "bold",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {currentYear}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: "min(600px, 90vw)",
          fontSize: "12px",
          color: "#666",
        }}
      >
        <span>{minYear}</span>
        <span>{maxYear}</span>
      </div>
    </div>
  );
};
