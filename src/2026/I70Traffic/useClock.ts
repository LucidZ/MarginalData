import { useEffect, useState } from "react";

export const SPEEDS = [
  { label: "1 s / hr", ms: 1000 },
  { label: "0.4 s / hr", ms: 400 },
];

// The shared clock: a whole hour 0-23. Playing steps it forward and wraps
// at midnight.
export const useClock = () => {
  const [hour, setHour] = useState(7);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(SPEEDS[0].ms);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHour((h) => (h + 1) % 24), speedMs);
    return () => window.clearInterval(id);
  }, [playing, speedMs]);

  return { hour, setHour, playing, setPlaying, speedMs, setSpeedMs };
};
