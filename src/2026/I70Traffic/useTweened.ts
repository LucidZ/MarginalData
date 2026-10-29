import { useEffect, useRef, useState } from "react";
import { easeCubicInOut, interpolateNumber, timer } from "d3";

// Tweens an array of numbers toward `target` over `duration` ms. Only bar
// geometry uses the tweened values - labels always show the real count.
export const useTweened = (target: number[], duration: number) => {
  const [values, setValues] = useState(target);
  const current = useRef(target);
  const key = target.join(",");

  useEffect(() => {
    const from = current.current;
    const interps = target.map((t, i) => interpolateNumber(from[i] ?? t, t));
    const t = timer((elapsed) => {
      const k = easeCubicInOut(Math.min(1, elapsed / duration));
      const next = interps.map((f) => f(k));
      current.current = next;
      setValues(next);
      if (k >= 1) t.stop();
    });
    return () => t.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration]);

  return values;
};
