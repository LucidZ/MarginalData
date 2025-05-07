import React from "react";
import { Guess1SubmittedAtom } from "./atoms";
import { useAtomValue } from "jotai";
import { Pie } from "./Pie";
import { Sources } from "./Sources";
import { GuessFeedback } from "./GuessFeedback";

export const RevealedContent = () => {
  const Guess1Submitted = useAtomValue(Guess1SubmittedAtom);
  if (Guess1Submitted === false) return null;
  if (Guess1Submitted === true)
    return (
      <>
        <GuessFeedback />
        <Pie
          width={300}
          height={300}
          centerX={150}
          centerY={150}
          strokeWidth={10}
          isDraggable={false}
          endPercent={0.006}
        ></Pie>
        <h2>
          In 2023, USAID managed $40 billion representing 0.6% of US federal
          expenditures.{" "}
        </h2>
        <p>
          {" "}
          Combined with spending from other departments, the federal government
          spent around 1% of its budget on foreign aid in 2023.
        </p>
        <Sources />
      </>
    );
};
