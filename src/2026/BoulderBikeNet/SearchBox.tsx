import { useEffect, useId, useMemo, useState } from "react";
import type { Place, PlaceIndex } from "./search";

interface Props {
  index: PlaceIndex | null;
  badge: string; // "A" / "B"
  color: string;
  placeholder: string;
  value: string; // label of the current pin, "" when unset
  onPick: (p: Place) => void;
  onClear: () => void;
}

export default function SearchBox({ index, badge, color, placeholder, value, onPick, onClear }: Props) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();

  // Follow the pin when it's set elsewhere (map click, drag, example)
  useEffect(() => setText(value), [value]);

  const results = useMemo(() => (index && open && text.trim().length >= 2 ? index.search(text) : []), [index, open, text]);

  const choose = (p: Place) => {
    setText(p.label);
    setOpen(false);
    onPick(p);
  };

  return (
    <div className="bbn-search">
      <span className="bbn-pin bbn-pin-inline" style={{ background: color }}>{badge}</span>
      <div className="bbn-search-field">
        <input
          type="search"
          value={text}
          placeholder={index ? placeholder : "Loading addresses…"}
          disabled={!index}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHi(0);
            if (!e.target.value) onClear();
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi(Math.min(hi + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi(Math.max(hi - 1, 0)); }
            else if (e.key === "Enter" && results[hi]) { e.preventDefault(); choose(results[hi]); }
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        {results.length > 0 && (
          <ul className="bbn-results" id={listId} role="listbox">
            {results.map((r, i) => (
              <li key={`${r.label}|${r.sub}|${i}`} role="option" aria-selected={i === hi} className={i === hi ? "hi" : ""}
                onMouseDown={(e) => { e.preventDefault(); choose(r); }} onMouseEnter={() => setHi(i)}>
                {r.label} <span className="bbn-muted">{r.sub}</span>
              </li>
            ))}
          </ul>
        )}
        {open && text.trim().length >= 2 && index && results.length === 0 && (
          <div className="bbn-results bbn-results-none">No match. Try a street name, or click the map.</div>
        )}
      </div>
    </div>
  );
}
