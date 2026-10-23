import { useJsonData } from "../../hooks/useJsonData";
import type { TrafficData } from "./types";

const dataUrl = "/data/i70-traffic/days.json";

export const useData = () => useJsonData<TrafficData>(dataUrl);
