import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

// Anchor beside the clicked node, then clamp so the card never leaves the
// viewport - nodes near the right edge or low on a tall column would
// otherwise open a card that's half off-screen. `top` here is a cheap guess
// (estimated from row count, no DOM access) for the very first frame,
// before the card has actually rendered - see the layout effect below,
// which corrects it against the card's real height the instant it mounts.
// The estimate undercounted for a tall movie list, which used to let the
// "Center on" button clip past the bottom of the viewport.
function estimatePosition(clientX: number, clientY: number, movieCount: number): React.CSSProperties {
  // Rows are ~66px (38x57 poster + padding); the list stops growing at the
  // CSS max-height of 244px and scrolls from there.
  const listHeight = Math.min(movieCount * 66, 244);
  const estHeight = 56 + 24 + listHeight + 46;
  const flipLeft = clientX + GAP + CARD_WIDTH > window.innerWidth - EDGE;
  const left = flipLeft ? clientX - GAP - CARD_WIDTH : clientX + GAP;
  return {
    left: Math.max(EDGE, Math.min(left, window.innerWidth - CARD_WIDTH - EDGE)),
    top: Math.max(EDGE, Math.min(clientY - 40, window.innerHeight - estHeight - EDGE)),
    width: CARD_WIDTH,
  };
}

export default function DetailCard({ selection, rootActor, compact, onCenter, onClose }: Props) {
  const { actor, sharedMovies, clientX, clientY } = selection;
  const cardRef = useRef<HTMLDivElement>(null);
  // App.tsx keys this component by actor id, so a new selection is a fresh
  // mount with a fresh estimate here, not a stale corrected position left
  // over from whichever actor's card was open before.
  const [style, setStyle] = useState<React.CSSProperties>(() =>
    compact ? {} : estimatePosition(clientX, clientY, sharedMovies.length),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Close-on-outside-click, replacing the old full-viewport backdrop <div>.
  // That backdrop sat above the chart to catch outside clicks, which meant
  // every click - including one landing on a *different* actor node - hit
  // the backdrop first and only closed this card; opening the new one took
  // a second click. A capture-phase document listener instead lets the
  // click keep going to whatever it actually landed on: this fires first
  // and clears the selection, then the click still bubbles to the node
  // underneath and opens its card, so switching actors is one click again.
  // Capture (not bubble) is what makes the ordering work - it runs before
  // React's own bubble-phase onClick, so onClose() is always the first of
  // the two setSelection calls in that click's batch, not the last.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [onClose]);

  // Corrects `top` against the card's real rendered height once it's
  // actually in the DOM - `left`/`width` don't need correcting, since width
  // is always the fixed CARD_WIDTH the estimate already used. Runs after
  // every render, not just on mount, so it also re-settles if the card's own
  // content height changes while it's open (e.g. a poster image finishing
  // its layout). useLayoutEffect fires before the browser paints, so this
  // correction is never visible as a jump.
  useLayoutEffect(() => {
    if (compact) return;
    const el = cardRef.current;
    if (!el) return;
    const height = el.getBoundingClientRect().height;
    const top = Math.max(EDGE, Math.min(clientY - 40, window.innerHeight - height - EDGE));
    setStyle((prev) => (prev.top === top ? prev : { ...prev, top }));
  });

  const photo = photoUrl(actor, 64);
  const count = sharedMovies.length;

  const head = (
    <>
      {photo ? (
        <img className="tus-card-photo" src={photo} alt="" width={56} height={56} />
      ) : (
        <div className="tus-card-photo tus-card-photo-fallback" />
      )}
      <div>
        <div className="tus-card-name">{actor.name}</div>
        <div className="tus-card-meta">
          {count} film{count === 1 ? "" : "s"} with {rootActor.name}
        </div>
      </div>
    </>
  );

  return (
    <>
      <div
        ref={cardRef}
        className={`tus-card${compact ? " tus-card-sheet" : ""}`}
        style={style}
        role="dialog"
        aria-label={actor.name}
      >
        <button className="tus-card-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {actor.tmdbId ? (
          <a
            className="tus-card-head tus-person-link"
            href={`https://www.themoviedb.org/person/${actor.tmdbId}`}
            target="_blank"
            rel="noreferrer"
          >
            {head}
          </a>
        ) : (
          <div className="tus-card-head">{head}</div>
        )}

        <ul className="tus-card-movies">
          {sharedMovies.map((movie) => {
            const poster = posterUrl(movie);
            const body = (
              <>
                {poster ? (
                  <img className="tus-movie-poster" src={poster} alt="" loading="lazy" width={38} height={57} />
                ) : (
                  <span className="tus-movie-poster tus-movie-poster-fallback" aria-hidden="true" />
                )}
                <span className="tus-movie-text">
                  <span className="tus-movie-title">{movie.title}</span>
                  <span className="tus-movie-meta">
                    {movie.year ?? "—"}
                    {movie.rating !== undefined && (
                      <>
                        <span className="tus-movie-dot">·</span>
                        <span className="tus-movie-rating">★ {movie.rating.toFixed(1)}</span>
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
                    className="tus-movie-row"
                    href={`https://www.themoviedb.org/movie/${movie.tmdbId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {body}
                  </a>
                ) : (
                  <span className="tus-movie-row">{body}</span>
                )}
              </li>
            );
          })}
        </ul>

        <button className="tus-card-center" onClick={() => onCenter(actor)}>
          Center on {actor.name}
        </button>
      </div>
    </>
  );
}
