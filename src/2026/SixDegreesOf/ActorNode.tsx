import { photoUrl } from "./graph";
import type { Actor, Movie } from "./types";

interface Props {
  actor: Actor;
  x: number;
  y: number;
  size: number;
  sharedMovies: Movie[];
  onClick: (actor: Actor) => void;
  onHover: (actor: Actor, sharedMovies: Movie[], e: React.MouseEvent) => void;
  onLeave: () => void;
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

export default function ActorNode({ actor, x, y, size, sharedMovies, onClick, onHover, onLeave }: Props) {
  const url = photoUrl(actor);
  const r = size / 2;
  return (
    <g
      className="sdo-node"
      transform={`translate(${x}, ${y})`}
      onClick={() => onClick(actor)}
      onMouseEnter={(e) => onHover(actor, sharedMovies, e)}
      onMouseMove={(e) => onHover(actor, sharedMovies, e)}
      onMouseLeave={onLeave}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick(actor);
      }}
      aria-label={`${actor.name} - click to re-center`}
    >
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
