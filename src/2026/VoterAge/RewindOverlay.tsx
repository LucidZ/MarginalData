/**
 * The "don't read into this" layer for a morph between two elections.
 *
 * Mid-morph the bars are a lerp between two elections - numbers that no
 * election produced. The chart underneath is dimmed and blurred by the
 * caller (via `rewindHaze`), and this badge says why, the way a VCR's
 * on-screen display does: blinking chevrons and REW / FF, tucked into the
 * plot's top-right corner, where the oldest ages leave the plot empty, so
 * it covers no data. Under the chevrons, the year the labels describe - the
 * only place the year is printed while the timed rewind plays.
 *
 * Purely a label: the caller decides when it shows (`opacity`) and which
 * way time is running (`direction`).
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** How obscured the chart should be: 0 at either real year, ramping to 1
 * over the first/last 15% of the morph - by which point the eased bars
 * have barely started moving, so nothing lerped is ever shown crisp. */
export const rewindHaze = (u: number) => clamp01(Math.min(u, 1 - u) / 0.15);

export default function RewindOverlay({
  opacity,
  direction,
  label,
  year,
}: {
  opacity: number;
  direction: "back" | "forward";
  /** "rewind" / "fast-fwd", by direction. */
  label: string;
  year: string;
}) {
  const chevrons = direction === "back" ? "◀◀" : "▶▶";
  return (
    <div className="voa-vcr" style={{ opacity }} aria-hidden="true">
      <div className="voa-vcr__mode">
        {direction === "back" && <span className="voa-vcr__chevrons">{chevrons}</span>}
        <span>{label}</span>
        {direction === "forward" && <span className="voa-vcr__chevrons">{chevrons}</span>}
      </div>
      <div className="voa-vcr__year">{year}</div>
    </div>
  );
}
