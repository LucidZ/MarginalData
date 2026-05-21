// Placeholder stick-figure illustrations for each life stage.
// Rendered as SVG <g> elements inside FlowViz's coordinate space.
// Replace with commissioned artwork when ready.

const S = '#555';   // stroke color
const SW = 1.5;     // strokeWidth
const LC = 'round'; // strokeLinecap

// ── Stage 0: Student ─────────────────────────────────────────────────────────
// Positioned at (358, 4) in FlowViz coords — upper-right clear zone.
function Student() {
  return (
    <g transform="translate(358, 4)" strokeLinecap={LC} strokeLinejoin="round">
      {/* Mortarboard */}
      <rect x="28" y="8" width="24" height="3" rx="1" fill={S} stroke="none" />
      <line x1="40" y1="8" x2="40" y2="3" stroke={S} strokeWidth={SW} />
      <circle cx="40" cy="2" r="2.5" fill={S} />
      {/* Head */}
      <circle cx="40" cy="21" r="10" stroke={S} strokeWidth={SW} fill="none" />
      {/* Backpack */}
      <rect x="45" y="33" width="10" height="14" rx="2" stroke={S} strokeWidth={SW} fill="white" />
      {/* Body */}
      <line x1="40" y1="31" x2="40" y2="58" stroke={S} strokeWidth={2} />
      {/* Left arm → coffee cup */}
      <line x1="40" y1="39" x2="26" y2="50" stroke={S} strokeWidth={SW} />
      <rect x="17" y="48" width="10" height="12" rx="2" stroke={S} strokeWidth={SW} fill="white" />
      <path d="M27 51 Q32 51 32 54 Q32 57 27 57" stroke={S} strokeWidth={1} fill="none" />
      {/* Right arm */}
      <line x1="40" y1="39" x2="53" y2="46" stroke={S} strokeWidth={SW} />
      {/* Legs */}
      <line x1="40" y1="58" x2="33" y2="72" stroke={S} strokeWidth={SW} />
      <line x1="40" y1="58" x2="47" y2="72" stroke={S} strokeWidth={SW} />
      {/* Feet */}
      <line x1="33" y1="72" x2="27" y2="74" stroke={S} strokeWidth={SW} />
      <line x1="47" y1="72" x2="53" y2="74" stroke={S} strokeWidth={SW} />
    </g>
  );
}

// ── Stage 1: First Job ────────────────────────────────────────────────────────
function FirstJob() {
  return (
    <g transform="translate(348, 4)" strokeLinecap={LC} strokeLinejoin="round">
      {/* Head */}
      <circle cx="40" cy="19" r="10" stroke={S} strokeWidth={SW} fill="none" />
      {/* V-collar */}
      <path d="M33 29 L40 37 L47 29" stroke={S} strokeWidth={SW} fill="none" />
      {/* Tie */}
      <path d="M40 35 L37.5 49 L40 52 L42.5 49 Z" stroke={S} strokeWidth={1} fill="#e0e0e0" />
      {/* Jacket body */}
      <path d="M32 29 Q27 31 27 59 L53 59 Q53 31 48 29" stroke={S} strokeWidth={SW} fill="none" />
      {/* Left arm */}
      <line x1="27" y1="37" x2="18" y2="51" stroke={S} strokeWidth={SW} />
      {/* Right arm → briefcase */}
      <line x1="53" y1="37" x2="61" y2="53" stroke={S} strokeWidth={SW} />
      {/* Briefcase */}
      <rect x="58" y="51" width="17" height="13" rx="2" stroke={S} strokeWidth={SW} fill="white" />
      <path d="M62 51 L62 48 Q62 46 64 46 L69 46 Q71 46 71 48 L71 51"
        stroke={S} strokeWidth={SW} fill="none" />
      <line x1="58" y1="57" x2="75" y2="57" stroke={S} strokeWidth={1} />
      {/* Legs */}
      <line x1="36" y1="59" x2="31" y2="74" stroke={S} strokeWidth={SW} />
      <line x1="44" y1="59" x2="49" y2="74" stroke={S} strokeWidth={SW} />
      {/* Feet */}
      <line x1="31" y1="74" x2="25" y2="76" stroke={S} strokeWidth={SW} />
      <line x1="49" y1="74" x2="55" y2="76" stroke={S} strokeWidth={SW} />
    </g>
  );
}

// ── Stage 2: Established ──────────────────────────────────────────────────────
function Established() {
  return (
    <g transform="translate(335, 4)" strokeLinecap={LC} strokeLinejoin="round">
      {/* House (faded, behind) */}
      <path d="M82 54 L82 74 L116 74 L116 54 L99 38 Z"
        stroke="#ccc" strokeWidth={SW} fill="white" />
      <rect x="86" y="59" width="9" height="9" rx="1" stroke="#ccc" strokeWidth={1} fill="none" />
      <rect x="100" y="62" width="9" height="12" rx="1" stroke="#ccc" strokeWidth={1} fill="none" />
      {/* Figure 1 — Alex */}
      <circle cx="28" cy="17" r="9" stroke={S} strokeWidth={SW} fill="none" />
      <line x1="28" y1="26" x2="28" y2="55" stroke={S} strokeWidth={2} />
      <line x1="28" y1="35" x2="39" y2="44" stroke={S} strokeWidth={SW} />
      <line x1="28" y1="35" x2="17" y2="46" stroke={S} strokeWidth={SW} />
      <line x1="28" y1="55" x2="22" y2="71" stroke={S} strokeWidth={SW} />
      <line x1="28" y1="55" x2="34" y2="71" stroke={S} strokeWidth={SW} />
      <line x1="22" y1="71" x2="16" y2="73" stroke={S} strokeWidth={SW} />
      <line x1="34" y1="71" x2="40" y2="73" stroke={S} strokeWidth={SW} />
      {/* Figure 2 — Partner */}
      <circle cx="52" cy="17" r="9" stroke={S} strokeWidth={SW} fill="none" />
      <line x1="52" y1="26" x2="52" y2="55" stroke={S} strokeWidth={2} />
      <line x1="52" y1="35" x2="39" y2="44" stroke={S} strokeWidth={SW} />
      <line x1="52" y1="35" x2="63" y2="46" stroke={S} strokeWidth={SW} />
      <line x1="52" y1="55" x2="46" y2="71" stroke={S} strokeWidth={SW} />
      <line x1="52" y1="55" x2="58" y2="71" stroke={S} strokeWidth={SW} />
      <line x1="46" y1="71" x2="40" y2="73" stroke={S} strokeWidth={SW} />
      <line x1="58" y1="71" x2="64" y2="73" stroke={S} strokeWidth={SW} />
      {/* Clasped hands */}
      <circle cx="39" cy="44" r="3" stroke={S} strokeWidth={SW} fill="white" />
    </g>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export function AlexAvatarSvg({ stage }: { stage: number }) {
  if (stage === 0) return <Student />;
  if (stage === 1) return <FirstJob />;
  if (stage === 2) return <Established />;
  return null;
}
