import { useEffect, useRef, useState } from "react";

export const useContainerWidth = <T extends HTMLElement>(initial = 900) => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0].contentRect.width));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return [ref, width] as const;
};
