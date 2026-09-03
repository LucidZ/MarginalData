import { useJsonData } from "../../hooks/useJsonData";
import type { WildfireDataset } from "./types";

const dataUrl = "/data/wildfire/state-trends.json";

export const useData = () => useJsonData<WildfireDataset>(dataUrl);
