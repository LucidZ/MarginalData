import React from "react";
import { descending } from "d3";
import {
  guess1SubmittedAtom,
  selectedGuessAtom,
  stepAtom,
  dataAtom,
  xValueColumnAtom,
  siFormatAtom,
} from "./atoms";
import { useAtomValue, useAtom } from "jotai";

export const ButtonToSubmitGuess1 = () => {
  const [guess1Submitted, setGuess1Submitted] = useAtom(guess1SubmittedAtom);
  const [step, setStep] = useAtom(stepAtom);
  const [selectedGuess, setSelectedGuess] = useAtom(selectedGuessAtom);
  const [data, setData] = useAtom(dataAtom);
  const [xValueColumn, setXValueColumn] = useAtom(xValueColumnAtom);
  const [siFormat, setSiFormatAtom] = useAtom(siFormatAtom);

  const handleClick = () => {
    if (step === 0) {
    }
    if (step === 1) {
      setGuess1Submitted(true);
      setStep(step + 1);
    }
    if (step === 2) {
      setGuess1Submitted(false);
      setSelectedGuess(null);
      setData(
        data.slice().sort((a, b) => descending(a.ODAPercent, b.ODAPercent))
      );
      setXValueColumn("ODAPercent");
      setSiFormatAtom(".1%");
      setStep(step + 1);
    }
    if (step === 3) {
    }
    if (step === 4) {
      setGuess1Submitted(true);
      setStep(step + 1);
    }
  };

  switch (step) {
    case 0:
      return (
        <div>
          <button> Select a bar below first. </button>
        </div>
      );
    case 1:
      return (
        <div>
          <button className="pulse-element" onClick={handleClick}>
            {" "}
            Click to submit guess!{" "}
          </button>
        </div>
      );
    case 2:
      return (
        <div>
          <button className="pulse-element" onClick={handleClick}>
            {" "}
            Click to consider a different context{" "}
          </button>
        </div>
      );
    case 3:
      return (
        <div>
          <button> Select a bar first. </button>
        </div>
      );

    case 4:
      return (
        <div>
          <button className="pulse-element" onClick={handleClick}>
            {" "}
            Click me to submit your guess.{" "}
          </button>
        </div>
      );
    default:
      return null;
  }
};
