interface StepControlsProps {
  step: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
}

export const StepControls = ({
  step,
  totalSteps,
  onNext,
  onBack,
}: StepControlsProps) => {
  const isFirstStep = step === 0;
  const isLastStep = step === totalSteps - 1;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "20px",
        padding: "20px",
      }}
    >
      {!isFirstStep && (
        <button
          onClick={onBack}
          style={{
            fontSize: "16px",
            padding: "10px 24px",
            backgroundColor: "#ddd",
            color: "#333",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          ← Back
        </button>
      )}

      <div
        style={{
          fontSize: "14px",
          color: "#888",
          fontWeight: "500",
        }}
      >
        {step + 1} / {totalSteps}
      </div>

      {!isLastStep && (
        <button
          onClick={onNext}
          style={{
            fontSize: "16px",
            padding: "10px 24px",
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
          {step === 0 ? "Begin →" : "Next →"}
        </button>
      )}
    </div>
  );
};
