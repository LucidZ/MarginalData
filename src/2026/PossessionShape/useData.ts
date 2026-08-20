import { useJsonData } from "../../hooks/useJsonData";
import type { PossessionShapeData } from "./types";

const dataUrl = "/data/statsbomb/wc2022-final-possession-shape.json";

export const useData = () => useJsonData<PossessionShapeData>(dataUrl);
