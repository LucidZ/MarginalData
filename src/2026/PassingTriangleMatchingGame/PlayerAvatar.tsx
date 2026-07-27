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
        <img src={photo} alt={displayName} width={size} height={size} loading="lazy" />
      </span>
      <span className="ptmg-avatar-number">{number}</span>
    </span>
  );
}
