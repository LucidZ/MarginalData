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
  const pathRef = useRef();

  // Create path generator
  const pathGenerator = line()
    .x((d) => xScale(xValue(d)))
    .y((d) => yScale(yValue(d)))
    .curve(curveNatural);
  // Animation effect
  useEffect(() => {
    if (!pathRef.current) return;

    const path = select(pathRef.current);
    const pathLength = path.node().getTotalLength();

    // Set up initial state - make the path invisible
    path
      .attr("stroke-dasharray", pathLength)
      .attr("stroke-dashoffset", pathLength);

    // Animate the path
    path
      .transition()
      .duration(2000) // Animation duration in milliseconds
      .attr("stroke-dashoffset", 0);

    return () => {
      path.interrupt(); // Stop any ongoing transitions
    };
  }, [data, xScale, yScale, xValue, yValue, circleRadius]);

  return (
    <g className="marks">
      <path
        ref={pathRef}
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
