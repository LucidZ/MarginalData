import { useEffect } from "react";
import { photoUrl, posterUrl } from "./graph";
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
    // Estimate the card's height from its row count so a 20-film card doesn't
    // hang off the bottom of the viewport the way a flat reserve would let it.
    // Rows are ~66px (38x57 poster + padding); the list stops growing at the
    // CSS max-height of 244px and scrolls from there.
    const listHeight = Math.min(sharedMovies.length * 66, 244);
    const estHeight = 56 + 24 + listHeight + 46;
    const flipLeft = clientX + GAP + CARD_WIDTH > window.innerWidth - EDGE;
    const left = flipLeft ? clientX - GAP - CARD_WIDTH : clientX + GAP;
    style = {
      left: Math.max(EDGE, Math.min(left, window.innerWidth - CARD_WIDTH - EDGE)),
      top: Math.max(EDGE, Math.min(clientY - 40, window.innerHeight - estHeight - EDGE)),
      width: CARD_WIDTH,
    };
  }

  const photo = photoUrl(actor, 64);
  const count = sharedMovies.length;

  const head = (
    <>
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
    </>
  );

  return (
    <>
      <div className="sdo-card-backdrop" onClick={onClose} />
      <div className={`sdo-card${compact ? " sdo-card-sheet" : ""}`} style={style} role="dialog" aria-label={actor.name}>
        <button className="sdo-card-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {actor.tmdbId ? (
          <a
            className="sdo-card-head sdo-person-link"
            href={`https://www.themoviedb.org/person/${actor.tmdbId}`}
            target="_blank"
            rel="noreferrer"
          >
            {head}
          </a>
        ) : (
          <div className="sdo-card-head">{head}</div>
        )}

        <ul className="sdo-card-movies">
          {sharedMovies.map((movie) => {
            const poster = posterUrl(movie);
            const body = (
              <>
                {poster ? (
                  <img className="sdo-movie-poster" src={poster} alt="" loading="lazy" width={38} height={57} />
                ) : (
                  <span className="sdo-movie-poster sdo-movie-poster-fallback" aria-hidden="true" />
                )}
                <span className="sdo-movie-text">
                  <span className="sdo-movie-title">{movie.title}</span>
                  <span className="sdo-movie-meta">
                    {movie.year ?? "—"}
                    {movie.rating !== undefined && (
                      <>
                        <span className="sdo-movie-dot">·</span>
                        <span className="sdo-movie-rating">★ {movie.rating.toFixed(1)}</span>
                      </>
                    )}
                  </span>
                </span>
              </>
            );
            return (
              <li key={movie.id}>
                {movie.tmdbId ? (
                  <a
                    className="sdo-movie-row"
                    href={`https://www.themoviedb.org/movie/${movie.tmdbId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {body}
                  </a>
                ) : (
                  <span className="sdo-movie-row">{body}</span>
                )}
              </li>
            );
          })}
        </ul>

        <button className="sdo-card-center" onClick={() => onCenter(actor)}>
          Center on {actor.name}
        </button>
      </div>
    </>
  );
}
