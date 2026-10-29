import { SPEEDS } from "./useClock";
import { hourLabel } from "./format";

interface ControlsProps {
  hour: number;
  setHour: (h: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speedMs: number;
  setSpeedMs: (ms: number) => void;
}

export default function Controls({ hour, setHour, playing, setPlaying, speedMs, setSpeedMs }: ControlsProps) {
  return (
    <div className="i70-controls">
      <button type="button" className="i70-play" onClick={() => setPlaying(!playing)}
        aria-label={playing ? "Pause" : "Play"}>
        {playing ? "❚❚ Pause" : "▶ Play"}
      </button>
      <div className="i70-clock" aria-live="off">
        <span className="i70-clock-hour">{hourLabel(hour)}</span>
        <span className="i70-clock-sub">{hour === 23 ? "11 PM-midnight" : `to ${hourLabel(hour + 1)}`}</span>
      </div>
      <input type="range" min={0} max={23} step={1} value={hour} className="i70-scrubber"
        aria-label="Hour of day"
        onChange={(e) => {
          setPlaying(false);
          setHour(Number(e.target.value));
        }} />
      <div className="i70-speed" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button key={s.ms} type="button" aria-pressed={speedMs === s.ms}
            className={speedMs === s.ms ? "is-on" : ""} onClick={() => setSpeedMs(s.ms)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
