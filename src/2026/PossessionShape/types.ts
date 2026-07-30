export type PossessionState = "offense" | "defense";

export interface PositionSample {
  x: number;
  y: number;
  /** Number of on-ball actions this average was computed from. */
  n: number;
}

export interface PlayerPositionRecord {
  team: string;
  fullName: string;
  playerId: number;
  jerseyNumber: number;
  position: string;
  offense: PositionSample | null;
  defense: PositionSample | null;
}

export interface PossessionShapeData {
  matchId: number;
  teams: string[];
  formations: Record<string, string>;
  players: PlayerPositionRecord[];
}
