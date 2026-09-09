import { photoUrl } from "./graph";
import type { Actor, Movie } from "./types";

interface Props {
  actor: Actor;
  x: number;
  y: number;
  size: number;
  /** Radius of an invisible circle centered on this node, tappable/clickable
   * even where it extends past the visible avatar - see App.tsx for how
   * this is sized up to a real touch-target minimum for a small avatar
   * (some are drawn well under 44 CSS px - see beeswarm.ts's minNodeSize). */
  hitRadius: number;
  sharedMovies: Movie[];
  isSelected: boolean;
  /** Click/tap opens the detail card - re-centering is a deliberate button inside that card, not this click. On touch there is no hover, so every affordance has to hang off this one gesture. */
  onSelect: (actor: Actor, sharedMovies: Movie[], e: React.MouseEvent) => void;
  /** Registers/unregisters this node's real DOM element with App.tsx's
   * roving-tabindex machinery - it needs to call .focus() and
   * getBoundingClientRect() on whichever node is currently "the" focused
   * one, which means holding a live element reference per actor id rather
   * than going through React state. */
  domRef: (el: SVGGElement | null) => void;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ActorNode({ actor, x, y, size, hitRadius, sharedMovies, isSelected, onSelect, domRef }: Props) {
  const url = photoUrl(actor, size);
  const r = size / 2;
  return (
    <g
      ref={domRef}
      className={`sdo-node${isSelected ? " sdo-node-selected" : ""}`}
      transform={`translate(${x}, ${y})`}
      onClick={(e) => onSelect(actor, sharedMovies, e)}
      role="button"
      // -1, not 0: this node is only ever reachable via the roving
      // tabindex App.tsx drives off the <svg> itself (arrow keys move
      // real DOM focus between nodes with .focus() calls) - if every node
      // kept tabIndex 0, Tab would stop at each of the 200+ of them
      // individually instead of once for the whole chart.
      tabIndex={-1}
      aria-label={`${actor.name} - open details`}
    >
      {/* Native tooltip kept as a cheap desktop hover hint. The real detail
          (films, links, re-center) lives in the click-opened card, since touch
          devices never fire hover at all. */}
      <title>{actor.name}</title>
      {/* Invisible, only for hit-testing - extends the tappable area past the
          visible avatar for anything drawn under a real touch-target size
          (fill="transparent" still hit-tests with pointerEvents="all", it
          just paints nothing). Placed first/behind, not last/on top, so it
          can't visually sit over the avatar - it doesn't need to, since a
          click anywhere inside this <g> already bubbles to the onClick
          above regardless of which child was actually hit. Deliberately not
          trying to keep overlapping nodes' hit areas from overlapping each
          other - that would mean moving the avatars, which breaks the
          chart; the detail card that opens tells you who you got. */}
      <circle r={hitRadius} fill="transparent" pointerEvents="all" />
      <clipPath id={`sdo-clip-${actor.id}`}>
        <circle r={r} />
      </clipPath>
      {/* Surface-color ring, not a gridline-gray stroke - beeswarm-packed avatars
          routinely touch/overlap, and a ring in the page's own background color
          is what keeps adjacent circles visually separated (see dataviz skill's
          "surface ring" spec) rather than drawing a border that adds data-weight
          ink that isn't data. */}
      <circle className="sdo-node-ring" r={r + 1.5} />
      {url ? (
        <image
          href={url}
          x={-r}
          y={-r}
          width={size}
          height={size}
          clipPath={`url(#sdo-clip-${actor.id})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <>
          <circle className="sdo-node-fallback" r={r} clipPath={`url(#sdo-clip-${actor.id})`} />
          {size >= 20 && (
            <text className="sdo-node-initials" textAnchor="middle" dominantBaseline="central">
              {initials(actor.name)}
            </text>
          )}
        </>
      )}
    </g>
  );
}
