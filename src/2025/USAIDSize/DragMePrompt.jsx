import React from "react";
import { useAtomValue } from "jotai";
import { Guess1Atom } from "./atoms";

export const DragMePrompt = () => {
  const guess1 = useAtomValue(Guess1Atom);
  if (guess1 !== null) return null;
  if (guess1 === null)
    return (
      <text
        className="no-select"
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
      >
        Click and drag in this circle{" "}
      </text>
    );
};
