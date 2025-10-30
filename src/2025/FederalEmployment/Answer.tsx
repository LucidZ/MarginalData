import React from "react";
import { useAtomValue } from "jotai";
import { guessAtom } from "./atoms";

export const Answer = () => {
  const guess = useAtomValue(guessAtom);

  const answerText =
    guess === "Generally Decreasing"
      ? "That's right! "
      : "I too was surprised to learn that:";

  return (
    <>
      <h2>{answerText}</h2>
      <h2>
        Since the 1960s, the number of federal employees has been declining
        relative to overall employment.
      </h2>
      <p>
        {" "}
        The source of this data is the US Bureau of Labor Statistics as served
        by FRED:
      </p>
      <p>
        <a href="https://fred.stlouisfed.org/series/PAYEMS" target="_blank">
          Total Nonfarm Payroll Employment
        </a>
      </p>
      <p>
        <a
          href="https://fred.stlouisfed.org/series/CES9091000001"
          target="_blank"
        >
          Total Federal Payroll Employment
        </a>
      </p>
    </>
  );
};
