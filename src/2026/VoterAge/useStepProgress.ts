import { useEffect, useRef, useState } from "react";

/** Viewport y of the line a step's centre must cross to count as current:
 * the middle of whatever part of the viewport isn't covered at the top. */
export const readingLine = (coveredTop: number) => coveredTop + (window.innerHeight - coveredTop) / 2;

/**
 * Continuous sibling to useActiveStep: instead of "which step is active",
 * returns a fractional step index - 0.0 when step 0 is centered, 1.0 when
 * step 1 is centered, 0.5 exactly between them. Lets a sticky viz be a pure
 * function of scroll position, so a reader can stop mid-transition and
 * reverse it, rather than watching a fixed-duration tween replay.
 *
 * Measured per frame rather than cached because step heights are viewport
 * relative (min-height: 70vh) and the sticky viz's own measured height
 * feeds back into layout - a cached center goes stale on resize and on
 * the ResizeObserver pass in StickyViz.
 */
/**
 * `coveredTop`: px at the top of the viewport hidden behind something pinned
 * there (the chart, on phones). Progress is then measured at the centre of
 * the visible area below it rather than the viewport's centre, so the step
 * counted as current is the one the reader can actually see. Omit (or
 * return 0) for the desktop layout, where the chart sits beside the text.
 */
export function useStepProgress(
  count: number,
  coveredTop?: () => number
): {
  progress: number;
  activeStep: number;
  setStepRef: (i: number) => (el: HTMLElement | null) => void;
} {
  const [progress, setProgress] = useState(0);
  const elsRef = useRef<(HTMLElement | null)[]>(new Array(count).fill(null));
  // Read through a ref so a new function identity doesn't resubscribe.
  const coveredRef = useRef(coveredTop);
  coveredRef.current = coveredTop;

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const els = elsRef.current;
      if (els.length < 2 || els.some((el) => !el)) return;
      const y = window.scrollY + readingLine(coveredRef.current?.() ?? 0);
      const centers = els.map((el) => {
        const r = el!.getBoundingClientRect();
        return r.top + window.scrollY + r.height / 2;
      });
      let p = 0;
      if (y <= centers[0]) p = 0;
      else if (y >= centers[centers.length - 1]) p = centers.length - 1;
      else {
        for (let i = 0; i < centers.length - 1; i++) {
          if (y >= centers[i] && y <= centers[i + 1]) {
            const span = centers[i + 1] - centers[i];
            p = i + (span > 0 ? (y - centers[i]) / span : 0);
            break;
          }
        }
      }
      // Quantize: a sub-pixel scroll shouldn't re-run the d3 join. 1/200
      // is finer than the eye can resolve across a ~700px morph.
      const q = Math.round(p * 200) / 200;
      setProgress((prev) => (prev === q ? prev : q));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    measure();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [count]);

  const setStepRef = (i: number) => (el: HTMLElement | null) => {
    elsRef.current[i] = el;
  };

  return { progress, activeStep: Math.round(progress), setStepRef };
}
