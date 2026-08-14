import { useEffect, useState } from "react";
import type { WildfireDataset } from "./types";

const dataUrl = "/data/wildfire/state-trends.json";

export const useData = (): WildfireDataset | null => {
  const [data, setData] = useState<WildfireDataset | null>(null);

  useEffect(() => {
    fetch(dataUrl)
      .then((response) => response.json())
      .then((jsonData: WildfireDataset) => setData(jsonData))
      .catch((error) => {
        console.error("Error loading wildfire state-trends data:", error);
      });
  }, []);

  return data;
};
