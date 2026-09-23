/**
 * Beat 2's "don't read into this" layer for the 2024 -> 2022 morph.
 *
 * Mid-morph the bars are a lerp between two elections - numbers that no
 * election produced. The chart underneath is dimmed and blurred by the
 * caller (via `rewindHaze`), and this overlay says why:
 *
 *  - a timeline scrubber, 2022 o---*---o 2024, whose dot rides the scroll
 *    right-to-left (time runs left-to-right, and we're going back). The
 *    end circle only fills when the chart is resting on that real year, so
 *    "between years" reads as a dot on a line, never as a year.
 *  - a clock whose hands spin backwards. Purely decorative - it shows no
 *    data, it just says "rewinding" louder than any label could. Driven by
 *    the scroll, not a timer, so it stops and reverses with the reader.
 *
 * Both run off raw `u` (linear scroll fraction), like the year stamp they
 * replace - see the three-channel note in AgeBeats.
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** How obscured the chart should be: 0 at either real year, ramping to 1
 * over the first/last 15% of the morph - by which point the eased bars
 * have barely started moving, so nothing lerped is ever shown crisp. */
export const rewindHaze = (u: number) => clamp01(Math.min(u, 1 - u) / 0.15);

/** Minute-hand revolutions across the whole morph. */
const SPINS = 6;

/** `clockTop`: CSS top for the clock face's centre, within the plot. */
export default function RewindOverlay({ u, clockTop = "45%" }: { u: number; clockTop?: string }) {
  const haze = rewindHaze(u);
  const at2022 = u >= 0.999;
  const at2024 = u <= 0.001;
  const minute = -u * 360 * SPINS;
  const hour = 60 + minute / 12;

  return (
    <>
      <div className="voa-scrubber" data-u={u.toFixed(4)} aria-hidden="true">
        <span className={`voa-scrubber-year${at2022 ? " is-on" : ""}`}>2022</span>
        <span className="voa-scrubber-track">
          <span className={`voa-scrubber-end voa-scrubber-end--left${at2022 ? " is-on" : ""}`} />
          <span className={`voa-scrubber-end voa-scrubber-end--right${at2024 ? " is-on" : ""}`} />
          <span className="voa-scrubber-dot" style={{ left: `${(1 - u) * 100}%`, opacity: haze }} />
        </span>
        <span className={`voa-scrubber-year${at2024 ? " is-on" : ""}`}>2024</span>
      </div>
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
        <div className="voa-rewind-clock__label">rewinding</div>
      </div>
    </>
  );
}
