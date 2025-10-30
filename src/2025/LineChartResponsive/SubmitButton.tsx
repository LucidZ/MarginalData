import React from "react";
import { hasInteractedAtom, hasSubmittedAtom } from "./atoms";
import { useAtomValue, useAtom } from "jotai";

export const SubmitButton = () => {
  const [hasSubmitted, setHasSubmitted] = useAtom(hasSubmittedAtom);
  const hasInteracted = useAtomValue(hasInteractedAtom);
  //const [guess, setGuess] = useAtom(guessAtom);

  const handleClick = () => {
    setGuess1Submitted(true);
    setStep(step + 1);

    setData(
      data.slice().sort((a, b) => descending(a.ODAPercent, b.ODAPercent))
    );
  };

  const getState = () => {
    if (!hasInteracted) return "idle";
    if (!hasSubmitted) return "ready";
    return "submitted";
  };

  const state = getState();

  const buttonConfig = {
    idle: {
      text: "Select a region below first.",
      className: "",
      onClick: () => {},
    },
    ready: {
      text: "Click to submit guess!",
      className: "pulse-element",
      onClick: () => setHasSubmitted(true),
    },
    submitted: {
      text: "Guess submitted!",
      className: "",
      onClick: () => {},
    },
  };

  return (
    <div>
      {state !== "submitted" && (
        <button
          className={buttonConfig[state].className}
          onClick={buttonConfig[state].onClick}
        >
          {buttonConfig[state].text}
        </button>
      )}
    </div>
  );
};
