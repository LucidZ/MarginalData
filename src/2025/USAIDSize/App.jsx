import "./App.css";
import React from "react";

import { GuessText } from "./GuessText";
import { Pie } from "./Pie";
import { RevealedContent } from "./RevealedContent";
import { RevealContentButton } from "./RevealContentButton";

import { Guess1SubmittedAtom, Guess1Atom } from "./atoms";
import { useAtomValue } from "jotai";

const App = () => {
  const guess1Submitted = useAtomValue(Guess1SubmittedAtom);
  const guess1 = useAtomValue(Guess1Atom);
  return (
    <div className="app-container">
      <h2>
        What % of US federal government spending was managed by USAID in 2023?
      </h2>
      <GuessText />
      <Pie
        width={300}
        height={300}
        centerX={150}
        centerY={150}
        strokeWidth={10}
        isDraggable={!guess1Submitted}
        endPercent={guess1}
      ></Pie>
      <RevealContentButton />
      <RevealedContent />
    </div>
  );
};

export default App;
