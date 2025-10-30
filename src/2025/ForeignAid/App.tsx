import "./App.css";
import React, { useEffect, useState, useCallback } from "react";
import { csv, scaleBand, scaleLinear, max, format } from "d3";
import { useData } from "./useData.js";
import { useDataOffline } from "./useDataOffline.js";
import { BarGraphVertical } from "./BarGraphVertical.jsx";
import { ButtonToSubmitGuess1 } from "./ButtonToSubmitGuess1.jsx";
import { Question } from "./Question.jsx";
import { xValueColumnAtom, siFormatAtom } from "./atoms.js";
import { useAtomValue } from "jotai";

const useResponsiveDimensions = () => {
  const [dimensions, setDimensions] = useState({
    width: 600,
    height: 600,
  });

  useEffect(() => {
    const updateDimensions = () => {
      const containerPadding = 40; // Account for container padding (20px each side)
      const availableWidth = window.innerWidth - containerPadding;
      const availableHeight = window.innerHeight * 0.7; // 70% of viewport height for bar chart

      // Get chart margins based on available width
      const isMobile = availableWidth < 768;
      const chartMargins = {
        left: isMobile ? 80 : 120,
        right: isMobile ? 80 : 120,
        top: 20,
        bottom: isMobile ? 60 : 80,
      };

      // Set max dimensions for bar chart
      const maxTotalWidth = 600;
      const maxTotalHeight = 600;
      const minTotalHeight = 350;

      // Calculate final total dimensions (SVG size including margins)
      const finalTotalWidth = Math.min(availableWidth, maxTotalWidth);
      const finalTotalHeight = Math.max(
        Math.min(availableHeight, maxTotalHeight),
        minTotalHeight
      );

      setDimensions({
        width: finalTotalWidth,
        height: finalTotalHeight,
      });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  return dimensions;
};

const getResponsiveMargins = (width) => {
  const isMobile = width < 768;
  return {
    top: 20,
    right: isMobile ? 80 : 120,
    bottom: isMobile ? 60 : 80,
    left: isMobile ? 80 : 120,
  };
};

const yValue = (d) => d.Country;
//const siFormat = format(".2s");

const App = () => {
  const data = useDataOffline();
  const { width, height } = useResponsiveDimensions();
  const margin = getResponsiveMargins(width);
  const xValue = (d) => d[useAtomValue(xValueColumnAtom)];
  const siFormat = format(useAtomValue(siFormatAtom));
  const xAxisTickFormat = (tickValue) =>
    siFormat(tickValue).replace("G", "B").replace(".0", "");

  if (!data) {
    return <pre>Data is Loading...</pre>;
  }

  return (
    <div className="container">
      <Question />
      <ButtonToSubmitGuess1 />
      <BarGraphVertical
        width={width}
        height={height}
        margin={margin}
        data={data}
        yValue={yValue}
        xValue={xValue}
        siFormat={siFormat}
        xAxisTickFormat={xAxisTickFormat}
      />
    </div>
  );
};

export default App;
