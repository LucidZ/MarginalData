import React from "react";
import { useAtomValue } from "jotai";
import { Guess1Atom } from "./atoms";

export const GuessFeedback = () => {
  const guess1 = useAtomValue(Guess1Atom);
  if (guess1 < 0.02)
    return (
      <div>
        <h3>
          {" "}
          Well done! You're in the ballpark! 97% of Americans in a 2016 survey,
          overestimated the size of foreign aid.
        </h3>
      </div>
    );
  if (guess1 > 0.01)
    return (
      <div>
        <h3>
          {" "}
          You, like myself and 97% of Americans in a 2016 survey, overestimated
          the size of foreign aid.
        </h3>
      </div>
    );
};
