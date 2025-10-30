import { atom } from "jotai";

export const dataAtom = atom<any[] | null>(null);
export const xValueColumnAtom = atom<string>("ODA");
export const siFormatAtom = atom<string>(".2s");

export const hoveredGuessAtom = atom<any | null>(null);
export const selectedGuessAtom = atom<any | null>(null);
export const guess1SubmittedAtom = atom<boolean>(false);
export const stepAtom = atom<number>(0);
