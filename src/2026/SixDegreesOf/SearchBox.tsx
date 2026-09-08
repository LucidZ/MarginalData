import { useMemo, useState } from "react";
import type { Actor } from "./types";

interface Props {
  actors: Actor[];
  onSelect: (actor: Actor) => void;
}

const MAX_RESULTS = 8;

export default function SearchBox({ actors, onSelect }: Props) {
  const [query, setQuery] = useState("");

  // `actors` arrives pre-sorted by co-star degree (see generate_six_degrees_data.py),
  // so among equally-good substring matches the more-connected actor surfaces first.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: Actor[] = [];
    for (const actor of actors) {
      if (actor.name.toLowerCase().includes(q)) {
        results.push(actor);
        if (results.length >= MAX_RESULTS) break;
      }
    }
    return results;
  }, [actors, query]);

  return (
    <div className="sdo-search">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type an actor's name..."
        className="sdo-search-input"
        aria-label="Search for an actor"
      />
      {matches.length > 0 && (
        <ul className="sdo-search-results">
          {matches.map((actor) => (
            <li key={actor.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(actor);
                  setQuery("");
                }}
              >
                {actor.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
