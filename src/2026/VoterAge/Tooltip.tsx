import type { ReactNode } from "react";

interface Props {
  content: ReactNode;
  clientX: number;
  clientY: number;
}

const TOOLTIP_W = 200;
const TOOLTIP_H = 80;

/**
 * Fixed-position tooltip, viewport-clamped, that flips above the
 * pointer when there's no room below - a touch finger covers the point
 * it's on, and a tap near the bottom of the screen leaves no room below
 * it either. Same approach as WildfireStateTrends/Tooltip.tsx; kept as
 * its own copy rather than a shared import since these live in sibling
 * story trees, not a shared module.
 */
export default function Tooltip({ content, clientX, clientY }: Props) {
  const left = Math.max(8, Math.min(clientX + 14, window.innerWidth - TOOLTIP_W - 8));
  const top =
    clientY + 14 + TOOLTIP_H > window.innerHeight
      ? Math.max(8, clientY - TOOLTIP_H - 14)
      : clientY + 14;

  return (
    <div className="voa-tooltip" style={{ left, top }}>
      {content}
    </div>
  );
}
