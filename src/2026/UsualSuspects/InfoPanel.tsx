import { useEffect, useRef } from "react";

interface Props {
  /** Pool totals, passed in rather than hardcoded so the panel can never
   * quote a figure the shipped data disagrees with - both come straight from
   * the loaded graph. Null while the full pool is still downloading, in
   * which case the counts are omitted rather than shown wrong (the bundled
   * default slice's own totals are real but are not the pool's). */
  actorCount: number | null;
  movieCount: number | null;
  onClose: () => void;
}

/**
 * The method note behind the ⓘ. Everything a reader needs to know to judge
 * what a number on this page means, in the order they'd need it: what counts
 * as a shared film, who's eligible to appear at all, and the two limits that
 * make a count here a floor rather than a total.
 *
 * Also where TMDB attribution lives, which their API terms require and which
 * this site had nowhere at all - the page hotlinks profile images off
 * image.tmdb.org on every view.
 */
export default function InfoPanel({ actorCount, movieCount, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the panel on open so a keyboard user isn't left behind
  // on the toggle button, and Escape closes - the two things a dialog has to
  // do that a plain div doesn't get for free.
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    // Capture phase, like DetailCard's own outside-click handling: a click
    // that lands on the chart underneath must close this panel rather than
    // also selecting whatever node it hit.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose]);

  return (
    <div className="tus-info-backdrop">
      <div className="tus-info" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="tus-info-title">
        <button type="button" className="tus-card-close" onClick={onClose} ref={closeRef} aria-label="Close">
          ×
        </button>
        <h2 id="tus-info-title">About this chart</h2>

        <p>
          Every row is a number of films two people made together. The people in a row are
          the costars who share exactly that many films with whoever the chart is centred
          on. Click anyone to see which films, or to recentre the chart on them.
        </p>

        <h3>What counts as a film</h3>
        <p>
          Theatrical features only — IMDb title type <code>movie</code>, non-adult, 40
          minutes or longer. TV episodes, shorts, straight-to-video and TV movies are all
          excluded, so a pair who worked together constantly on television can still show
          up here with one film or none.
        </p>

        <h3>Who's in the pool</h3>
        <p>
          {actorCount && movieCount ? (
            <>
              {actorCount.toLocaleString()} actors across {movieCount.toLocaleString()} films.{" "}
            </>
          ) : null}
          The pool is bounded by fame before any of the connections are built: an actor has
          to clear a threshold on how widely their films were voted on at IMDb. The full
          actor graph is around 1.1 million people and 13 million co-appearances, which is
          neither shippable as static data nor legible if it were.
        </p>

        <h3>Two reasons a count here is a floor</h3>
        <p>
          <strong>Costars are only counted inside the pool.</strong> Someone who made ten
          films with an actor who didn't clear the fame threshold doesn't appear at all.
          {/* Deliberately not quoting a figure here. An earlier draft used a
              worked example ("278 costars means…") and it read as a claim
              about whoever was on screen behind the panel, who by then had a
              different number. */}
          The costar count on any chart means <em>in this pool</em>, never in that
          person's whole career.
        </p>
        <p>
          <strong>IMDb lists about ten credited cast per title.</strong> Two people both in
          a large ensemble may not both make that list, so shared films can be undercounted
          for exactly the crowded movies where you'd most expect a connection.
        </p>

        <h3>Sources</h3>
        <p>
          Connections and film metadata come from{" "}
          <a href="https://developer.imdb.com/non-commercial-datasets/" target="_blank" rel="noreferrer">
            IMDb's non-commercial datasets
          </a>
          . Photos, posters and ratings come from{" "}
          <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
            TMDB
          </a>
          . This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </div>
  );
}
