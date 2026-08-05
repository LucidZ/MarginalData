import { useEffect, useState } from "react";
import type { PossessionShapeData } from "./types";

const dataUrl = "/data/statsbomb/wwc2023-final-possession-shape.json";

export const useData = (): PossessionShapeData | null => {
  const [data, setData] = useState<PossessionShapeData | null>(null);

  useEffect(() => {
    fetch(dataUrl)
      .then((response) => response.json())
      .then((jsonData: PossessionShapeData) => {
        setData(jsonData);
      })
      .catch((error) => {
        console.error("Error loading possession shape data:", error);
      });
  }, []);

  return data;
};
