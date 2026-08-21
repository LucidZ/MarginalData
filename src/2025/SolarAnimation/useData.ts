import { useJsonData } from "../../hooks/useJsonData";
import type { SolarAnimationData } from "./types";

const dataUrl = "/data/solar_animation_2024.json";

export const useData = () => useJsonData<SolarAnimationData>(dataUrl);
