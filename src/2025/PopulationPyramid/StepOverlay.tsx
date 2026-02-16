interface StepOverlayProps {
  step: number;
}

export const StepOverlay = ({ step }: StepOverlayProps) => {
  const stepContent = [
    {
      // Step 0: Introduction
      title: "US Population Pyramid 2010-2100",
      text: "Explore how the age structure of the United States changes over time, including future projections.",
    },
    {
      // Step 1: Show current year
      title: "The Present Day",
      text: "This is the US population in 2025. Males on the left, females on the right. Each bar represents a single year of age.",
    },
    {
      // Step 2: Highlight Baby Boomers
      title: "The Baby Boom Generation",
      text: "Born 1946-1964, the Baby Boomers (shown in orange) are one of the largest generations in US history.",
    },
    {
      // Step 3: Show aging
      title: "An Aging Population",
      text: "Watch as the Baby Boomers move up the pyramid. The population ages as birth rates decline and life expectancy increases.",
    },
    {
      // Step 4: Future projection
      title: "Looking Ahead to 2100",
      text: "By 2100, the US population structure will look very different. Notice the shift toward older age groups.",
    },
    {
      // Step 5: Animation
      title: "90 Years of Change",
      text: "Watch the full transformation from 2010 to 2100. See how cohorts age and the pyramid reshapes.",
    },
    {
      // Step 6: Free exploration
      title: "Explore Yourself",
      text: "Use the slider to explore any year. Click age bars to highlight and track specific birth cohorts over time.",
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
        border: "2px solid #4CAF50",
        borderRadius: "12px",
        textAlign: "center",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
        zIndex: 100,
        pointerEvents: step === 0 ? "auto" : "none",
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
