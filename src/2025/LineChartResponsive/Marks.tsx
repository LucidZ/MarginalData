import React, { useEffect, useRef } from "react";
import { line, curveNatural, select } from "d3";
export const Marks = ({
  data,
  xScale,
  yScale,
  xValue,
  yValue,
  tooltipFormat,
  circleRadius,
}) => {
  // Create path generator
  const pathGenerator = line()
    .x((d) => xScale(xValue(d)))
    .y((d) => yScale(yValue(d)))
    .curve(curveNatural);

  return (
    <g className="marks">
      <path
        fill="none"
        stroke="black"
        strokeWidth="4"
        d={pathGenerator(data)}
      />
      {/* Uncommenting below will show static circles */}
      {/*
      {data.map((d, i) => (
        <circle 
          key={i}
          cx={xScale(xValue(d))} 
          cy={yScale(yValue(d))} 
          r={circleRadius}
        >
          <title>{tooltipFormat(xValue(d))}</title>
        </circle>
      ))}
      */}
    </g>
  );
};
