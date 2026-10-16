import { useEffect, useRef, useState } from "react";

/**
 * Tracks which of N step elements is "active" - the one currently
 * crossing the vertical center of the viewport - using a zero-height
 * IntersectionObserver rootMargin trick ("-50% 0px -50% 0px" collapses
 * the observed root to a single line at mid-viewport). Same approach as
 * the financial-literacy series' useScrollSteps (see
 * .claude/financial-literacy-spec.md) - built directly here since that
 * hook lives in a sibling story tree, not a shared module.
 *
 * Replaces the earlier continuous-scroll-fraction approach (dividing one
 * container's total scroll height into N even zones), which decoupled
 * "which step is active" from where the text actually was on screen -
 * the sticky viz would advance before or after the corresponding text
 * block reached the middle of the viewport, depending on where the
 * container happened to be in its scroll range.
 */
export function useActiveStep(count: number): {
  activeStep: number;
  setStepRef: (i: number) => (el: HTMLElement | null) => void;
} {
  const [activeStep, setActiveStep] = useState(0);
  const elsRef = useRef<(HTMLElement | null)[]>(new Array(count).fill(null));

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = elsRef.current.indexOf(entry.target as HTMLElement);
            if (idx !== -1) setActiveStep(idx);
          }
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 }
    );
    elsRef.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [count]);

  const setStepRef = (i: number) => (el: HTMLElement | null) => {
    elsRef.current[i] = el;
  };

  return { activeStep, setStepRef };
}
