import { atom } from "jotai";
import type { FederalEmploymentData } from "./useData";

export const dataAtom = atom<FederalEmploymentData[] | null>(null);

export const guessAtom = atom<number>(0);
export const hasInteractedAtom = atom<boolean>(false);
export const hasSubmittedAtom = atom<boolean>(false);
