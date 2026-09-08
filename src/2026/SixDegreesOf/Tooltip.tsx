import type { Actor, Movie } from "./types";

export interface HoverInfo {
  actor: Actor;
  sharedMovies: Movie[];
  /** Viewport coordinates (from the triggering mouse event), not SVG coordinates. */
  clientX: number;
  clientY: number;
}

interface Props {
  hover: HoverInfo;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const OFFSET = 16;

export default function Tooltip({ hover, onMouseEnter, onMouseLeave }: Props) {
  const { actor, sharedMovies, clientX, clientY } = hover;
  // Flip to the left of the cursor once we're past the right two-thirds of
  // the viewport, so the tooltip doesn't run off-screen for nodes near the
  // right edge (columns can be scrolled far right - see App.tsx).
  const flipLeft = typeof window !== "undefined" && clientX > window.innerWidth * 0.66;

  return (
    <div
      className="sdo-tooltip"
      style={{
        left: clientX,
        top: clientY,
        transform: flipLeft ? `translate(calc(-100% - ${OFFSET}px), ${OFFSET}px)` : `translate(${OFFSET}px, ${OFFSET}px)`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="sdo-tooltip-name">{actor.name}</div>
      <ul className="sdo-tooltip-movies">
        {sharedMovies.map((movie) => (
          <li key={movie.id}>
            {movie.tmdbId ? (
              <a
                href={`https://www.themoviedb.org/movie/${movie.tmdbId}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {movie.title}
              </a>
            ) : (
              movie.title
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
