import { photoUrl } from "./graph";
import type { Actor, Movie } from "./types";

interface Props {
  actor: Actor;
  x: number;
  y: number;
  size: number;
  sharedMovies: Movie[];
  isSelected: boolean;
  /** Click/tap opens the detail card - re-centering is a deliberate button inside that card, not this click. On touch there is no hover, so every affordance has to hang off this one gesture. */
  onSelect: (actor: Actor, sharedMovies: Movie[], e: React.MouseEvent) => void;
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

export default function ActorNode({ actor, x, y, size, sharedMovies, isSelected, onSelect }: Props) {
  const url = photoUrl(actor, size);
  const r = size / 2;
  return (
    <g
      className={`sdo-node${isSelected ? " sdo-node-selected" : ""}`}
      transform={`translate(${x}, ${y})`}
      onClick={(e) => onSelect(actor, sharedMovies, e)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(actor, sharedMovies, e as unknown as React.MouseEvent);
        }
      }}
      aria-label={`${actor.name} - open details`}
    >
      {/* Native tooltip kept as a cheap desktop hover hint. The real detail
          (films, links, re-center) lives in the click-opened card, since touch
          devices never fire hover at all. */}
      <title>{actor.name}</title>
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
