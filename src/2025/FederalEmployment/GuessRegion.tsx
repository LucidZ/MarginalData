import React, { useState, useEffect, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import { guessAtom, hasInteractedAtom, hasSubmittedAtom } from "./atoms";

export const GuessRegion = ({ x1, y1, x2, y2, x3, y3, id }) => {
  // State to track hover state
  const [isHovered, setIsHovered] = useState(false);
  const [pulseValue, setPulseValue] = useState(0.2);
  const [hasInteracted, setHasInteracted] = useAtom(hasInteractedAtom);
  const hasSubmitted = useAtomValue(hasSubmittedAtom);
  const [guess, setGuess] = useAtom(guessAtom);

  // Create the points string for the polygon (triangle)
  const points = `${x1},${y1} ${x2},${y2} ${x3},${y3}`;

  // Pulsing animation only before first interaction
  useEffect(() => {
    if (!hasInteracted) {
      const interval = setInterval(() => {
        setPulseValue((prev) => (prev === 0.2 ? 0.4 : 0.2));
      }, 750);

      return () => clearInterval(interval);
    }
  }, [hasInteracted]);

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  // Handle click event
  const handleClick = () => {
    setGuess(id);
    console.log("Guess:", id);
    setHasInteracted(true);
  };

  // Calculate opacity based on hover state OR if this is the currently selected guess
  const getOpacity = () => {
    if (isHovered || id === guess) {
      return 0.6;
    } else if (!hasInteracted) {
      return pulseValue;
    } else if (!hasSubmitted) {
      return 0.2;
    } else return 0.0;
  };

  return (
    <polygon
      className={id}
      points={points}
      fill={"green"}
      opacity={getOpacity()}
      stroke={"white"}
      strokeWidth="1.5"
      onMouseEnter={!hasSubmitted ? handleMouseEnter : null}
      onMouseLeave={() => setIsHovered(false)}
      onClick={!hasSubmitted ? handleClick : null}
      style={{
        cursor: "pointer", // Change cursor to pointer on hover
        pointerEvents: "all", // Forces this element to receive pointer events
        transition: "opacity .75s ease", // Smooth transition for opacity
      }}
    />
  );
};
