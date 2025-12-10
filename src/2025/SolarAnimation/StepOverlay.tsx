interface StepOverlayProps {
  step: number;
}

export const StepOverlay = ({ step }: StepOverlayProps) => {
  const stepContent = [
    {
      // Step 0: Introduction
      title: "California Solar Generation 2024",
      text: "Explore how solar power production changes throughout the year",
    },
    {
      // Step 1: Single Day
      title: "A Single Day",
      text: "This shows solar generation on June 21, 2024. Power increases as the sun rises, peaks around 1 PM, then falls as the sun sets.",
    },
    {
      // Step 2: Weather Variations
      title: "Weather Matters",
      text: "Two days later on June 23, atmospheric conditions like clouds and fog reduce solar output compared to the clear day.",
    },
    {
      // Step 3: Yearly Pattern
      title: "The Year at a Glance",
      text: "The bottom chart shows the entire year of 2024. Each point represents total daily generation. Notice the seasonal pattern - higher in summer, lower in winter.",
    },
    {
      // Step 4: Minimum Day
      title: "Lowest Generation",
      text: "January 22 had the lowest generation - short winter day combined with cloudy weather.",
    },
    {
      // Step 5: Maximum Day
      title: "Peak Generation",
      text: "June 29 had peak generation - long sunny summer day with maximum capacity.",
    },
    {
      // Step 6: Full Year
      title: "The Full Year",
      text: "Watch the complete year animate, showing seasonal patterns and daily variations.",
    },
    {
      // Step 7: Free Exploration
      title: "Explore Yourself",
      text: "Hover over the timeline to explore any day. Click to pin days for comparison.",
    },
  ];

  const content = stepContent[step];

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "calc(100vw - 60px)",
        maxWidth: "500px",
        margin: "0",
        padding: "clamp(20px, 4vw, 30px)",
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        border: "2px solid #ff8c00",
        borderRadius: "12px",
        textAlign: "center",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
        zIndex: 100,
        pointerEvents: step === 0 ? "auto" : "none", // Only block interaction on intro
      }}
    >
      <h2
        style={{
          margin: "0 0 15px 0",
          color: "#333",
          fontSize: "clamp(20px, 4vw, 24px)",
          fontWeight: "bold",
        }}
      >
        {content.title}
      </h2>
      <p
        style={{
          margin: 0,
          color: "#555",
          fontSize: "clamp(14px, 3vw, 16px)",
          lineHeight: "1.6",
        }}
      >
        {content.text}
      </p>
    </div>
  );
};
