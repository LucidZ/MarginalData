import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import { explorerCopy } from "./copy";

export interface YearOption {
  year: string;
  kind: "presidential" | "midterm";
  /** No data for this year in the current view - shown, but not pickable. */
  disabled?: boolean;
}

interface Props {
  options: YearOption[]; // chronological, left to right
  /** The year every printed number currently describes (snaps at a hop's
   * midpoint) - the radio group's checked button. */
  shown: string;
  /** The year the chart is resting on, or null mid-morph. */
  resting: string | null;
  /** Continuous position in `options` index units (0 = first year): where
   * the black highlight sits. Between years it straddles two buttons. */
  pos: number;
  /** Fades the whole control. Below 0.5 it's inert, so a hidden timeline
   * can't be tabbed into or clicked. */
  opacity: number;
  /** Scrolls the page to that year - the chart gets there by playing every
   * hop in between, so the cohort slide survives a jump. */
  onPick: (year: string) => void;
}

/**
 * The story's timeline, 2012 ... 2024, pinned above the chart. A radio group
 * (arrow keys, Home/End); midterms get a tinted fill and the key below
 * names both styles, so the distinction never rests on color. Under 400px
 * the labels shorten to '12 ... '24 so all seven fit a 360px screen; the
 * full year stays in aria-label.
 */
export default function YearControl({ options, shown, resting, pos, opacity, onPick }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const hidden = opacity < 0.5;

  // Arrow keys step past disabled years; Home/End land on the nearest
  // enabled one.
  const move = (to: number, dir: 1 | -1) => {
    let i = Math.max(0, Math.min(options.length - 1, to));
    while (options[i]?.disabled) i += dir;
    if (i < 0 || i >= options.length) return;
    onPick(options[i].year);
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const next: Record<string, [number, 1 | -1]> = {
      ArrowLeft: [i - 1, -1],
      ArrowUp: [i - 1, -1],
      ArrowRight: [i + 1, 1],
      ArrowDown: [i + 1, 1],
      Home: [0, 1],
      End: [options.length - 1, -1],
    };
    if (e.key in next) {
      e.preventDefault();
      move(...next[e.key]);
    }
  };

  return (
    <div className="voa-yc" style={{ opacity }} inert={hidden} aria-hidden={hidden || undefined}>
      <div
        className="voa-yc-row"
        role="radiogroup"
        aria-label={explorerCopy.controlLabel}
        style={{ "--yc-n": options.length, "--yc-p": pos } as CSSProperties}
      >
        {options.map((o, i) => {
          const on = o.year === shown;
          return (
            <button
              key={o.year}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${o.year}, ${o.kind === "midterm" ? explorerCopy.midterm : explorerCopy.presidential}`}
              tabIndex={on ? 0 : -1}
              disabled={o.disabled}
              className={`voa-yc-btn voa-yc-btn--${o.kind}${o.year === resting ? " is-on" : ""}`}
              onClick={() => onPick(o.year)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <span className="voa-yc-full" aria-hidden="true">
                {o.year}
              </span>
              <span className="voa-yc-short" aria-hidden="true">
                &rsquo;{o.year.slice(2)}
              </span>
            </button>
          );
        })}
        {/* The highlight: a black copy of the row with white labels, clipped
            to one button's box at `pos`. It slides through the years in
            between, and whatever label it covers reads white. Clicks pass
            through to the buttons underneath. */}
        <span className="voa-yc-ink" aria-hidden="true">
          {options.map((o) => (
            <span key={o.year} className="voa-yc-ink-slot">
              <span className="voa-yc-full">{o.year}</span>
              <span className="voa-yc-short">&rsquo;{o.year.slice(2)}</span>
            </span>
          ))}
        </span>
      </div>
      <div className="voa-yc-key" aria-hidden="true">
        <span>
          <span className="voa-yc-key-swatch voa-yc-key-swatch--presidential" /> {explorerCopy.presidential}
        </span>
        <span>
          <span className="voa-yc-key-swatch voa-yc-key-swatch--midterm" /> {explorerCopy.midterm}
        </span>
      </div>
    </div>
  );
}
