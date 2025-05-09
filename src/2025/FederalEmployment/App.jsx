import "./App.css";
import React, { useEffect, useState, useCallback } from "react";
import {
  csv,
  scaleLinear,
  scaleTime,
  max,
  format,
  timeFormat,
  extent,
} from "d3";
import { useData } from "./useData.js";
import { AxisBottom } from "./AxisBottom";
import { AxisLeft } from "./AxisLeft";
import { Marks } from "./Marks";
import { ChartContainer } from "./ChartContainer.jsx";
import { GuessRegion } from "./GuessRegion.jsx";
import { Question } from "./Question.jsx";
import { SubmitButton } from "./SubmitButton.jsx";
import { Answer } from "./Answer.jsx";
import { useAtomValue } from "jotai";
import { hasSubmittedAtom } from "./atoms.js";

const width = 960;
const height = 500;
const margin = { top: 20, right: 30, bottom: 65, left: 90 };
const xAxisLabelOffset = 50;
const yAxisLabelOffset = 45;
const lastPointOfPreview = 252;

const App = () => {
  const data = useData();
  const hasSubmitted = useAtomValue(hasSubmittedAtom);

  if (!data) {
    return <pre>Data is Loading...</pre>;
  }

  const innerHeight = height - margin.top - margin.bottom;
  const innerWidth = width - margin.left - margin.right;

  const xValue = (d) => d.timestamp;
  const xAxisTickFormat = timeFormat("%Y");
  const xAxisLabel = "Time";

  const yValue = (d) => d.Federal / d.TotalNonFarm;
  const yAxisTickFormat = format(".0%");
  const yAxisLabel = "Percent";

  const xScale = scaleTime()
    .domain(extent(data, xValue))
    .range([0, innerWidth])
    .nice();

  const yScale = scaleLinear()
    .domain([0, max(data, yValue) + 0.01])
    .range([innerHeight, 0])
    .nice();

  const lastDataPointOfPreview = data[lastPointOfPreview - 1];

  return (
    <>
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
    </>
  );
};

export default App;
