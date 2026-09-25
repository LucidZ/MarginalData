import { useRef, type KeyboardEvent } from "react";
import { explorerCopy } from "./copy";

export interface YearOption {
  year: string;
  kind: "presidential" | "midterm";
}

interface Props {
  options: YearOption[]; // ascending
  selected: string;
  onSelect: (year: string) => void;
}

/**
 * One button per election, as a radio group: only the selected button is in
 * the tab order, and the arrow keys move the selection (and focus) along the
 * row. Midterms get a dashed outline and the key below names both styles, so
 * the distinction never rests on color. Under 400px the labels shorten to
 * '12 ... '24 so all seven fit a 360px screen; the full year stays in
 * aria-label.
 */
export default function YearControl({ options, selected, onSelect }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (to: number) => {
    const i = Math.max(0, Math.min(options.length - 1, to));
    onSelect(options[i].year);
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
    <div className="voa-yc">
      <div className="voa-yc-row" role="radiogroup" aria-label={explorerCopy.controlLabel}>
        {options.map((o, i) => {
          const on = o.year === selected;
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
              className={`voa-yc-btn voa-yc-btn--${o.kind}${on ? " is-on" : ""}`}
              onClick={() => onSelect(o.year)}
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
