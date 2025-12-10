import { useEffect, useState } from "react";
import type { SolarAnimationData } from "./types";

const dataUrl = "/data/solar_animation_2024.json";

export const useData = (): SolarAnimationData | null => {
  const [data, setData] = useState<SolarAnimationData | null>(null);

  useEffect(() => {
    fetch(dataUrl)
      .then((response) => response.json())
      .then((jsonData: SolarAnimationData) => {
        setData(jsonData);
      })
      .catch((error) => {
        console.error("Error loading solar animation data:", error);
      });
  }, []);

  return data;
};
