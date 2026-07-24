import type { TriangleRecord } from "../PassingCompass/types";

export interface GamePitch {
  id: string;
  label: string;
  correctFullName: string;
  triangles: TriangleRecord[];
}

/** Maps a pitch id to the full name of the player currently placed there, or null if empty. */
export type Assignments = Record<string, string | null>;
