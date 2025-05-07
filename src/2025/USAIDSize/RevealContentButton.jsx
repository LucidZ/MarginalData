import React from "react";
import { Guess1Atom, Guess1SubmittedAtom } from "./atoms";
import { useAtomValue, useAtom } from "jotai";

export const RevealContentButton = () => {
  const guess1 = useAtomValue(Guess1Atom);
  const [guess1Submitted, setGuess1Submitted] = useAtom(Guess1SubmittedAtom);
  const handleClick = () => {
    setGuess1Submitted(true);
  };
  if (guess1Submitted) return null;
  if (guess1 === null) return null;
  if (guess1 !== null)
    return (
      <div>
        <button onClick={handleClick}> Click to Reveal Answer </button>
      </div>
    );
};
