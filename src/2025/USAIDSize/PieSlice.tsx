import React, { useContext } from "react";
import { arc } from "d3";
import { useAtomValue } from "jotai";
import { Guess1Atom } from "./atoms";

export const PieSlice = ({ radius, startPercent, endPercent, isDraggable }) => {
  const guess1 = useAtomValue(Guess1Atom);
  const PieSliceArc = arc()
    .innerRadius(0)
    .outerRadius(radius)
    .startAngle(Math.PI * 2 * startPercent);

  if (isDraggable) PieSliceArc.endAngle(Math.PI * 2 * guess1);
  else PieSliceArc.endAngle(Math.PI * 2 * endPercent);

  return <path d={PieSliceArc()} fill="#2d7d4c" />;
};
