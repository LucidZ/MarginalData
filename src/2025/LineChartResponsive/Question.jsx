import React from "react";
import { useAtomValue } from "jotai";
import { guessAtom } from "./atoms";

export const Question = () => {
  const guess = useAtomValue(guessAtom);

  return (
    <h2>
      Since 1960, US Federal Employment as a % of the Labor Force has been{" "}
      <span style={{ color: "green", textDecoration: "underline" }}>
        {guess ? guess : "____________"}
      </span>
      ?
    </h2>
  );
};
