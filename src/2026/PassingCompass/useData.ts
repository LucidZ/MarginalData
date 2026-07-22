import { useEffect, useState } from "react";
import type { PassingCompassData } from "./types";

const dataUrl = "/data/statsbomb/wc2022-final-passing.json";

export const useData = (): PassingCompassData | null => {
  const [data, setData] = useState<PassingCompassData | null>(null);

  useEffect(() => {
    fetch(dataUrl)
      .then((response) => response.json())
      .then((jsonData: PassingCompassData) => {
        setData(jsonData);
      })
      .catch((error) => {
        console.error("Error loading passing compass data:", error);
      });
  }, []);

  return data;
};
