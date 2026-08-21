import { useJsonData } from "../../hooks/useJsonData";
import type { PassingCompassData } from "./types";

const dataUrl = "/data/statsbomb/wc2022-final-passing.json";

export const useData = () => useJsonData<PassingCompassData>(dataUrl);
