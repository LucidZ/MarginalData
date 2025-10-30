import "./App.css";
import { useEffect, useState } from "react";
import { scaleLinear, scaleTime, max, format, timeFormat, extent } from "d3";
import { useData, type FederalEmploymentData } from "./useData";
import { AxisBottom } from "./AxisBottom";
import { AxisLeft } from "./AxisLeft";
import { Marks } from "./Marks";
import { ChartContainer } from "./ChartContainer";
import { GuessRegion } from "./GuessRegion";
import { Question } from "./Question";
import { SubmitButton } from "./SubmitButton";
import { Answer } from "./Answer";
import { useAtomValue } from "jotai";
import { hasSubmittedAtom } from "./atoms.js";

const useResponsiveDimensions = () => {
  const [dimensions, setDimensions] = useState({
    width: 960,
    height: 500,
  });

  useEffect(() => {
    const updateDimensions = () => {
      const containerPadding = 40; // Account for container padding (20px each side)
      const availableWidth = window.innerWidth - containerPadding;
      const availableHeight = window.innerHeight * 0.6; // 60% of viewport height

      // Set max dimensions
      const maxTotalWidth = 960;
      const maxTotalHeight = 500;
      const minTotalHeight = 300;

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

const getResponsiveMargins = (width: number) => {
  const isMobile = width < 768;
  return {
    top: 20,
    right: isMobile ? 20 : 30,
    bottom: isMobile ? 50 : 65,
    left: isMobile ? 60 : 90,
  };
};
const lastPointOfPreview = 252;

const App = () => {
  const data = useData();
  const hasSubmitted = useAtomValue(hasSubmittedAtom);
  const { width, height } = useResponsiveDimensions();
  const margin = getResponsiveMargins(width);

  // Calculate responsive offsets
  const xAxisLabelOffset = width < 768 ? 40 : 50;
  const yAxisLabelOffset = width < 768 ? 35 : 45;

  if (!data) {
    return <pre>Data is Loading...</pre>;
  }

  const innerHeight = height - margin.top - margin.bottom;
  const innerWidth = width - margin.left - margin.right;

  const xValue = (d: FederalEmploymentData) => d.timestamp;
  const xAxisTickFormat = timeFormat("%Y");
  const xAxisLabel = "Time";

  const yValue = (d: FederalEmploymentData) => d.Federal / d.TotalNonFarm;
  const yAxisTickFormat = format(".0%");
  const yAxisLabel = "Percent";

  const xScale = scaleTime()
    .domain(extent(data, xValue) as [Date, Date])
    .range([0, innerWidth])
    .nice();

  const yScale = scaleLinear()
    .domain([0, (max(data, yValue) || 0) + 0.01])
    .range([innerHeight, 0])
    .nice();

  const lastDataPointOfPreview = data[lastPointOfPreview - 1];

  return (
    <div className="container">
      <Question />

      <ChartContainer
        width={width}
        height={height}
        centerX={margin.left}
        centerY={margin.top}
        isDraggable={true}
      >
        <AxisBottom
          xScale={xScale}
          innerHeight={innerHeight}
          tickFormat={xAxisTickFormat}
          tickOffset={7}
        />
        <text
          className="axis-label no-select"
          textAnchor="middle"
          transform={`translate(${-yAxisLabelOffset},${
            innerHeight / 2
          }) rotate(-90)`}
        >
          {yAxisLabel}
        </text>
        <AxisLeft
          yScale={yScale}
          innerWidth={innerWidth}
          tickFormat={yAxisTickFormat}
          tickOffset={7}
        />
        <text
          className="axis-label no-select"
          x={innerWidth / 2}
          y={innerHeight + xAxisLabelOffset}
          textAnchor="middle"
        >
          {xAxisLabel}
        </text>
        <Marks
          data={!hasSubmitted ? data.slice(0, lastPointOfPreview) : data}
          xScale={xScale}
          yScale={yScale}
          xValue={xValue}
          yValue={yValue}
          tooltipFormat={xAxisTickFormat}
          circleRadius={3}
        />
        <GuessRegion
          x1={xScale(xValue(lastDataPointOfPreview))}
          y1={yScale(yValue(lastDataPointOfPreview))}
          x2={innerWidth}
          y2={yScale(yValue(lastDataPointOfPreview) + 0.015)}
          x3={innerWidth}
          y3={yScale(yValue(lastDataPointOfPreview) - 0.015)}
          id="Generally Flat"
        />
        <GuessRegion
          x1={xScale(xValue(lastDataPointOfPreview))}
          y1={yScale(yValue(lastDataPointOfPreview))}
          x2={innerWidth}
          y2={yScale(yValue(lastDataPointOfPreview) - 0.015)}
          x3={innerWidth}
          y3={yScale(yValue(lastDataPointOfPreview) - 3 * 0.015)}
          id="Generally Decreasing"
        />
        <GuessRegion
          x1={xScale(xValue(lastDataPointOfPreview))}
          y1={yScale(yValue(lastDataPointOfPreview))}
          x2={innerWidth}
          y2={yScale(yValue(lastDataPointOfPreview) + 3 * 0.015)}
          x3={innerWidth}
          y3={yScale(yValue(lastDataPointOfPreview) + 0.015)}
          id="Generally Increasing"
        />
      </ChartContainer>
      {!hasSubmitted ? <SubmitButton /> : <Answer />}
    </div>
  );
};

export default App;
