import dragTracker from "./dragTracker";
import React, { useState, useContext } from "react";
import getPiePercentFromXY from "./getPiePercentFromXY";
import { DragMePrompt } from "./DragMePrompt";

import { useAtom } from "jotai";
import { Guess1Atom } from "./atoms";

export const PieContainer = ({
  children,
  width,
  height,
  centerX,
  centerY,
  isDraggable,
}) => {
  const [guess1, setGuess1] = useAtom(Guess1Atom);
  const [dragStats, setDragStats] = useState(null);
  const { position, dimensions, eventHandlers } = dragTracker({
    onDragMove: (positionData) => {
      setDragStats(positionData);
      const newGuess = getPiePercentFromXY(
        position.element.x - dimensions.width / 2,
        position.element.y - dimensions.height / 2
      );
      setGuess1(newGuess);
      console.log(guess1);
    },
  });
  return (
    <svg width={width} height={height} {...(isDraggable ? eventHandlers : {})}>
      <g transform={`translate(${centerX}, ${centerY})`}>{children}</g>
      {isDraggable && <DragMePrompt />}
    </svg>
  );
};
