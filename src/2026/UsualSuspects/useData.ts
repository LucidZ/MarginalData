import { useJsonData } from "../../hooks/useJsonData";
import type { GraphData } from "./types";

const dataUrl = "/data/usual-suspects-pool-a.json";

export const useData = () => useJsonData<GraphData>(dataUrl);
