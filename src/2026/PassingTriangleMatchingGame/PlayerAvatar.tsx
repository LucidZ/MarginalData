interface Props {
  photo: string;
  displayName: string;
  number: number;
  size?: number;
}

export default function PlayerAvatar({ photo, displayName, number, size = 72 }: Props) {
  return (
    <span className="ptmg-avatar" style={{ width: size, height: size }}>
      <span className="ptmg-avatar-photo">
        {/* draggable=false: browsers drag <img> natively by default, which
            hijacks our own pointer-based drag (fires pointercancel a couple
            pixels into the gesture) before it ever gets a chance to run. */}
        <img src={photo} alt={displayName} width={size} height={size} loading="lazy" draggable={false} />
      </span>
      <span className="ptmg-avatar-number">{number}</span>
    </span>
  );
}
