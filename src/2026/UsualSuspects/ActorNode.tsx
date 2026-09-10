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
  /** Desktop-only fast path: double-click jumps straight to centering on this
   * actor, skipping the intermediate card. Doesn't touch what a single
   * click means (still just opens the card), so there's no new state to
   * learn - it's an accelerator for people who already recognize the
   * thumbnail, not a replacement gesture. Left off touch: mobile's default
   * double-tap-to-zoom would fight it, and the bottom-sheet card's own
   * "Center on" button is already one tap away there. */
  onCenter: (actor: Actor) => void;
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

export default function ActorNode({
  actor,
  x,
  y,
  size,
  sharedMovies,
  isSelected,
  onSelect,
  onCenter,
  domRef,
}: Props) {
  const url = photoUrl(actor, size);
  const r = size / 2;
  return (
    <g
      ref={domRef}
      className={`tus-node${isSelected ? " tus-node-selected" : ""}`}
      transform={`translate(${x}, ${y})`}
      onClick={(e) => onSelect(actor, sharedMovies, e)}
      onDoubleClick={() => onCenter(actor)}
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
      {/* The ONLY hit-testable element in this node - matches the visible
          avatar's own radius exactly (not inflated to a touch-target
          minimum the way this used to be). packColumn's forceCollide keeps
          every pair of node centers >= 2r+2 apart, so a same-radius disc
          can never reach past its own center into a neighbor's - unlike the
          old inflated version, which blanketed neighboring nodes and made
          most of a dense column's faces unclickable at their own center
          (measured: 71-89% across desktop/mobile). Small avatars still get
          a forgiving miss-click target, just not from their own disc - see
          the nearest-center overlay behind the whole chart in App.tsx,
          which is what actually makes sub-44px avatars reachable now.
          Explicit fill="transparent" + pointerEvents="all" rather than
          relying on the clipped <image>'s own raster hit-testing, which is
          browser-dependent past the clip boundary. Every other child below
          is explicitly pointerEvents="none" - see the ring's own comment
          for why that's load-bearing, not decoration. */}
      <circle r={r} fill="transparent" pointerEvents="all" />
      <clipPath id={`tus-clip-${actor.id}`}>
        <circle r={r} />
      </clipPath>
      {/* Surface-color ring, not a gridline-gray stroke - beeswarm-packed avatars
          routinely touch/overlap, and a ring in the page's own background color
          is what keeps adjacent circles visually separated (see dataviz skill's
          "surface ring" spec) rather than drawing a border that adds data-weight
          ink that isn't data. pointerEvents="none" is load-bearing, not
          cosmetic: this is stroked (not fill:none), and SVG's default
          pointer-events value hit-tests painted strokes same as fills - a
          stroke reaching to r+3 on a node whose neighbors can be packed as
          close as ~r+1 apart (forceCollide's +1px-per-node margin) was
          swallowing clicks aimed at the gap between two avatars, resolving
          to whichever ring painted there instead of the geometrically
          nearest node the overlay in App.tsx was supposed to catch. */}
      <circle className="tus-node-ring" r={r + 1.5} pointerEvents="none" />
      {/* Always rendered, even when a photo is coming - not just the
          no-photo fallback it started as. A node whose photo *exists* but
          hasn't decoded yet used to paint nothing at all until it did,
          which on a slow connection (a fresh recenter fetches ~200 new
          avatars at once) left a freshly recentered chart looking broken
          rather than loading - a throttled test found one column still
          33/34 empty three seconds in. Sits behind the <image> below, so it
          only shows through for as long as that image hasn't painted. */}
      <circle className="tus-node-fallback" r={r} clipPath={`url(#tus-clip-${actor.id})`} pointerEvents="none" />
      {url && (
        <image
          href={url}
          x={-r}
          y={-r}
          width={size}
          height={size}
          clipPath={`url(#tus-clip-${actor.id})`}
          preserveAspectRatio="xMidYMid slice"
          pointerEvents="none"
        />
      )}
      {!url && size >= 20 && (
        <text className="tus-node-initials" textAnchor="middle" dominantBaseline="central" pointerEvents="none">
          {initials(actor.name)}
        </text>
      )}
    </g>
  );
}
