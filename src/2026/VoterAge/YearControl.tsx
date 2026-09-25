import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import { explorerCopy } from "./copy";

export interface YearOption {
  year: string;
  kind: "presidential" | "midterm";
}

interface Props {
  options: YearOption[]; // chronological, left to right
  /** The year every printed number currently describes (snaps at a hop's
   * midpoint) - the radio group's checked button. */
  shown: string;
  /** The year the chart is resting on, or null mid-morph. Only this button
   * fills: between years the timeline shows a dot between two buttons,
   * never a year. */
  resting: string | null;
  /** Continuous position in `options` index units (0 = first year), for
   * the dot riding the scroll. */
  dotPos: number;
  dotOpacity: number;
  /** Fades the whole control. Below 0.5 it's inert, so a hidden timeline
   * can't be tabbed into or clicked. */
  opacity: number;
  /** Scrolls the page to that year - the chart gets there by playing every
   * hop in between, so the cohort slide survives a jump. */
  onPick: (year: string) => void;
}

/**
 * The story's timeline, 2012 ... 2024, pinned above the chart. A radio group
 * (arrow keys, Home/End); midterms get a dashed outline and the key below
 * names both styles, so the distinction never rests on color. Under 400px
 * the labels shorten to '12 ... '24 so all seven fit a 360px screen; the
 * full year stays in aria-label.
 */
export default function YearControl({ options, shown, resting, dotPos, dotOpacity, opacity, onPick }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const hidden = opacity < 0.5;

  const move = (to: number) => {
    const i = Math.max(0, Math.min(options.length - 1, to));
    onPick(options[i].year);
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const next: Record<string, number> = {
      ArrowLeft: i - 1,
      ArrowUp: i - 1,
      ArrowRight: i + 1,
      ArrowDown: i + 1,
      Home: 0,
      End: options.length - 1,
    };
    if (e.key in next) {
      e.preventDefault();
      move(next[e.key]);
    }
  };

  return (
    <div className="voa-yc" style={{ opacity }} inert={hidden} aria-hidden={hidden || undefined}>
      <div
        className="voa-yc-row"
        role="radiogroup"
        aria-label={explorerCopy.controlLabel}
        style={{ "--yc-n": options.length, "--yc-p": dotPos } as CSSProperties}
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
        <span className="voa-yc-track" aria-hidden="true">
          <span className="voa-yc-dot" style={{ opacity: dotOpacity }} />
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
