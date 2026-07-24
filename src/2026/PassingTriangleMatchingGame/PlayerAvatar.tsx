import { useId } from "react";

interface Props {
  number: number;
  size?: number;
}

// Illustrated jersey badge (Argentina albiceleste stripes) — used instead of
// real player photos, see project memory for why.
export default function PlayerAvatar({ number, size = 72 }: Props) {
  const patternId = useId();

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className="ptmg-avatar"
      role="img"
      aria-label={`Jersey number ${number}`}
    >
      <defs>
        <pattern id={patternId} width="12" height="100" patternUnits="userSpaceOnUse">
          <rect width="12" height="100" fill="#ffffff" />
          <rect width="6" height="100" fill="#6cace4" />
        </pattern>
      </defs>

      {/* sleeves */}
      <path d="M18 26 L2 14 L2 38 L18 46 Z" fill={`url(#${patternId})`} stroke="#0b3866" strokeWidth="2" strokeLinejoin="round" />
      <path d="M82 26 L98 14 L98 38 L82 46 Z" fill={`url(#${patternId})`} stroke="#0b3866" strokeWidth="2" strokeLinejoin="round" />

      {/* body */}
      <path
        d="M32 20 L18 26 L18 92 L82 92 L82 26 L68 20 Q50 32 32 20 Z"
        fill={`url(#${patternId})`}
        stroke="#0b3866"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* collar */}
      <path d="M40 20 Q50 30 60 20" fill="none" stroke="#0b3866" strokeWidth="2.5" strokeLinecap="round" />

      <text
        x="50"
        y="68"
        textAnchor="middle"
        fontSize="32"
        fontWeight="700"
        fill="#0b3866"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {number}
      </text>
    </svg>
  );
}
