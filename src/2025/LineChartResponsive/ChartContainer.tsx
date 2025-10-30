import React, { useState, useContext } from "react";
import { useAtom } from "jotai";
import { guessAtom } from "./atoms";

export const ChartContainer = ({
  children,
  width,
  height,
  centerX,
  centerY,
  isDraggable,
}) => {
  return (
    <svg
      width={width}
      height={height}
      style={{
        maxWidth: "100%",
        height: "auto",
        display: "block",
      }}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform={`translate(${centerX}, ${centerY})`}>{children}</g>
    </svg>
  );
};
