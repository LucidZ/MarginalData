/**
 * The "don't read into this" layer for a morph between two elections.
 *
 * Mid-morph the bars are a lerp between two elections - numbers that no
 * election produced. The chart underneath is dimmed and blurred by the
 * caller (via `rewindHaze`), and this overlay says why: a clock whose hands
 * spin with the scroll. Purely decorative - it shows no data, it just says
 * "time is moving" louder than any label could. Driven by the scroll, not a
 * timer, so it stops and reverses with the reader: scrolling down spins the
 * hands backwards, scrolling up spins them forwards, and the caller swaps
 * the label to match.
 *
 * Where the reader is in time is the timeline's job (YearControl.tsx), not
 * this overlay's. Runs off raw `u` (linear scroll fraction within the
 * current hop) - see the three-channel note in AgeBeats.
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** How obscured the chart should be: 0 at either real year, ramping to 1
 * over the first/last 15% of the morph - by which point the eased bars
 * have barely started moving, so nothing lerped is ever shown crisp. */
export const rewindHaze = (u: number) => clamp01(Math.min(u, 1 - u) / 0.15);

/** Minute-hand revolutions across one hop. Whole turns, so the hands are
 * back where they started at every real year and the next hop picks up
 * without a jump. */
const SPINS = 6;

/** `clockTop`: CSS top for the clock face's centre, within the plot.
 * `label`: "rewinding" / "fast-forwarding", by scroll direction. */
export default function RewindOverlay({
  u,
  label,
  clockTop = "45%",
}: {
  u: number;
  label: string;
  clockTop?: string;
}) {
  const haze = rewindHaze(u);
  const minute = -u * 360 * SPINS;
  const hour = 60 + minute / 12;

  return (
    <div
      className="voa-rewind-clock"
      style={{ top: clockTop, opacity: haze, transform: `translate(-50%, -50%) scale(${0.85 + 0.15 * haze})` }}
      aria-hidden="true"
    >
      <svg viewBox="-50 -50 100 100" width="96" height="96">
        <circle r="44" className="voa-rewind-clock__face" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} y1={-38} y2={i % 3 === 0 ? -31 : -34} transform={`rotate(${i * 30})`} className="voa-rewind-clock__tick" />
        ))}
        <line y2={-20} transform={`rotate(${hour})`} className="voa-rewind-clock__hand voa-rewind-clock__hand--hour" />
        <line y2={-32} transform={`rotate(${minute})`} className="voa-rewind-clock__hand" />
        <circle r="3" className="voa-rewind-clock__pin" />
      </svg>
      <div className="voa-rewind-clock__label">{label}</div>
    </div>
  );
}
