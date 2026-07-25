/** A lineup slot on the single shared pitch, positioned at the real pivot centroid of one player. */
export interface GameSlot {
  id: string;
  x: number;
  y: number;
  correctFullName: string;
}

/** Maps a slot id to the full name of the player currently placed there, or null if empty. */
export type Assignments = Record<string, string | null>;
