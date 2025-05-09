import { atom } from "jotai";

export const dataAtom = atom(null);
export const xValueColumnAtom = atom("ODA");
export const siFormatAtom = atom(".2s");

export const hoveredGuessAtom = atom(null);
export const selectedGuessAtom = atom(null);
export const guess1SubmittedAtom = atom(false);
export const stepAtom = atom(0);
