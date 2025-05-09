import React from "react";
import { useAtomValue } from "jotai";
import { stepAtom, selectedGuessAtom } from "./atoms";

export const Question = () => {
  const step = useAtomValue(stepAtom);
  const guess = useAtomValue(selectedGuessAtom);
  switch (step) {
    case 0:
      return (
        <h3>
          Below is a graph of the foreign aid given by various countries. Which
          bar do you think represents the United States?
        </h3>
      );
    case 1:
      return (
        <h3>
          Below is a graph of the foreign aid given by various countries. Which
          bar do you think represents the United States?
        </h3>
      );
    case 2:
      if (guess === "United States")
        return (
          <h3>
            Correct! As the world's largest economy, it doesn't come as a
            surprise to you that the United States tops the foreign aid chart.
          </h3>
        );
      if (guess !== "United States")
        return (
          <h3>
            Good guess, but when it comes to raw spending on foreign aid, the
            United States tops the charts!
          </h3>
        );
    case 3:
      return (
        <h3>
          Below is a graph of the foreign aid given by the same countries, but
          this time as a % of each countries gross national income. Again, which
          bar do you think represents the United States?
        </h3>
      );
    case 4:
      return (
        <h3>
          Below is a graph of the foreign aid given by the same countries, but
          this time as a % of each countries gross national income. Again, which
          bar do you think represents the United States?
        </h3>
      );
    case 5:
      return (
        <h3>
          Despite being the worlds largest provider of foreign aid and despite
          all the controversy I read about in the news, I was surprised by how
          little US foreign aid is as a % of GNI.
        </h3>
      );

    default:
      console.log("step default");
      return null;
  }
};
