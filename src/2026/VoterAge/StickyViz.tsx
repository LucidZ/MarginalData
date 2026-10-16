import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Sticky chart pane that centers vertically in the viewport once pinned,
 * without a transform. `top: 50%` alone only top-aligns the box at
 * viewport-center; getting it centered instead needs shifting up by half
 * the box's own height. A CSS `transform: translateY(-50%)` does that
 * shift, but transforms apply unconditionally - including while the box
 * is still in normal scroll flow, before it's actually reached the sticky
 * point - which pulls it up over whatever content sits above it (the
 * beat's own title) during the entrance instead of letting it scroll in.
 *
 * Measuring the box's real height and feeding it into `top` itself sidesteps
 * that: `top` only has an effect once sticky engages, so there's no shift
 * while unstuck and no overlap. A CSS var (not `top` directly) carries the
 * measurement so the mobile media query's `top: 0` override still wins the
 * cascade rather than losing to an inline style.
 */
export default function StickyViz({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [halfHeight, setHalfHeight] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setHalfHeight(h / 2);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="voa-scrolly-viz" style={{ "--viz-half-height": `${halfHeight}px` } as React.CSSProperties}>
      <div ref={ref}>{children}</div>
    </div>
  );
}
