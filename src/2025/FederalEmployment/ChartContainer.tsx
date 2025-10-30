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
    <svg width={width} height={height}>
      <g transform={`translate(${centerX}, ${centerY})`}>{children}</g>
    </svg>
  );
};
