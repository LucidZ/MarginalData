import { useEffect } from "react";
import { photoUrl } from "./graph";
import type { Actor, Movie } from "./types";

export interface Selection {
  actor: Actor;
  sharedMovies: Movie[];
  /** Viewport coords of the click, used to anchor the floating desktop card. */
  clientX: number;
  clientY: number;
}

interface Props {
  selection: Selection;
  rootActor: Actor;
  /** Renders as a bottom sheet rather than a floating card - a 280px card anchored to a tapped node has nowhere to go on a 390px screen. */
  compact: boolean;
  onCenter: (actor: Actor) => void;
  onClose: () => void;
}

const CARD_WIDTH = 300;
const GAP = 14;
const EDGE = 8;

export default function DetailCard({ selection, rootActor, compact, onCenter, onClose }: Props) {
  const { actor, sharedMovies, clientX, clientY } = selection;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Anchor beside the clicked node, then clamp so the card never leaves the
  // viewport - nodes near the right edge or low on a tall column would
  // otherwise open a card that's half off-screen.
  let style: React.CSSProperties = {};
  if (!compact) {
    const flipLeft = clientX + GAP + CARD_WIDTH > window.innerWidth - EDGE;
    const left = flipLeft ? clientX - GAP - CARD_WIDTH : clientX + GAP;
    style = {
      left: Math.max(EDGE, Math.min(left, window.innerWidth - CARD_WIDTH - EDGE)),
      top: Math.max(EDGE, Math.min(clientY - 40, window.innerHeight - 260)),
      width: CARD_WIDTH,
    };
  }

  const photo = photoUrl(actor, 64);
  const count = sharedMovies.length;

  return (
    <>
      <div className="sdo-card-backdrop" onClick={onClose} />
      <div className={`sdo-card${compact ? " sdo-card-sheet" : ""}`} style={style} role="dialog" aria-label={actor.name}>
        <button className="sdo-card-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="sdo-card-head">
          {photo ? (
            <img className="sdo-card-photo" src={photo} alt="" width={56} height={56} />
          ) : (
            <div className="sdo-card-photo sdo-card-photo-fallback" />
          )}
          <div>
            <div className="sdo-card-name">{actor.name}</div>
            <div className="sdo-card-meta">
              {count} film{count === 1 ? "" : "s"} with {rootActor.name}
            </div>
          </div>
        </div>

        <ul className="sdo-card-movies">
          {sharedMovies.map((movie) => (
            <li key={movie.id}>
              {movie.tmdbId ? (
                <a href={`https://www.themoviedb.org/movie/${movie.tmdbId}`} target="_blank" rel="noreferrer">
                  {movie.title}
                </a>
              ) : (
                <span>{movie.title}</span>
              )}
            </li>
          ))}
        </ul>

        <button className="sdo-card-center" onClick={() => onCenter(actor)}>
          Center on {actor.name}
        </button>
      </div>
    </>
  );
}
