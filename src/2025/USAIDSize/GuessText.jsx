import React from "react";
import { useAtomValue } from "jotai";
import { Guess1Atom } from "./atoms";

export const GuessText = () => {
  const guess1 = useAtomValue(Guess1Atom);
  return <h3>Your guess is {Math.round(guess1 * 100)}% </h3>;
};
