import { useEffect, useState, type RefObject } from "react";

/**
 * Tracks 0..1 scroll progress through a container: 0 when its top just
 * enters the viewport bottom, 1 when its bottom reaches the viewport top.
 * Same continuous-progress approach as MarginalTax/App.tsx, factored out
 * since this story has four scrolly sections instead of one.
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const totalScrollable = el.scrollHeight - window.innerHeight;
      const scrolled = -rect.top;
      const p = totalScrollable > 0 ? scrolled / totalScrollable : 0;
      setProgress(Math.max(0, Math.min(1, p)));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [ref]);

  return progress;
}

/** Maps continuous progress to a discrete step index, given N step boundaries. */
export function stepFromProgress(progress: number, stepCount: number): number {
  return Math.min(stepCount - 1, Math.floor(progress * stepCount));
}
