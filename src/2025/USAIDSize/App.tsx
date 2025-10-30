import "./App.css";
import React, { useEffect, useState } from "react";

import { GuessText } from "./GuessText";
import { Pie } from "./Pie";
import { RevealedContent } from "./RevealedContent";
import { RevealContentButton } from "./RevealContentButton";

import { Guess1SubmittedAtom, Guess1Atom } from "./atoms";
import { useAtomValue } from "jotai";

const useResponsivePieDimensions = () => {
  const [dimensions, setDimensions] = useState({
    width: 300,
    height: 300,
    centerX: 150,
    centerY: 150,
    strokeWidth: 10,
  });

  useEffect(() => {
    const updateDimensions = () => {
      const containerPadding = 40; // Account for container padding
      const availableWidth = window.innerWidth - containerPadding;
      const availableHeight = window.innerHeight * 0.4; // 40% of viewport height for pie chart

      // Calculate responsive dimensions
      const isMobile = availableWidth < 768;
      const maxSize = 300;
      const minSize = 200;

      // Choose the smaller of available width/height to maintain square aspect ratio
      const availableSize = Math.min(availableWidth, availableHeight);
      const pieSize = Math.max(Math.min(availableSize, maxSize), minSize);

      setDimensions({
        width: pieSize,
        height: pieSize,
        centerX: pieSize / 2,
        centerY: pieSize / 2,
        strokeWidth: isMobile ? 8 : 10,
      });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  return dimensions;
};

const App = () => {
  const guess1Submitted = useAtomValue(Guess1SubmittedAtom);
  const guess1 = useAtomValue(Guess1Atom);
  const { width, height, centerX, centerY, strokeWidth } =
    useResponsivePieDimensions();

  return (
    <div className="container">
      <h2>
        What % of US federal government spending was managed by USAID in 2023?
      </h2>
      <GuessText />
      <Pie
        width={width}
        height={height}
        centerX={centerX}
        centerY={centerY}
        strokeWidth={strokeWidth}
        isDraggable={!guess1Submitted}
        endPercent={guess1}
      ></Pie>
      <RevealContentButton />
      <RevealedContent />
    </div>
  );
};

export default App;
