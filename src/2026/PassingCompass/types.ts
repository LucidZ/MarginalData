export type PassOutcome =
  | "Complete"
  | "Incomplete"
  | "Out"
  | "Pass Offside"
  | "Unknown";

export interface PassRecord {
  index: number;
  period: number;
  minute: number;
  team: string;
  player: string;
  playerId: number;
  recipient: string | null;
  recipientId: number | null;
  possession: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  outcome: PassOutcome;
  xtDelta: number;
}

export interface TriangleRecord {
  period: number;
  minute: number;
  team: string;
  passer: string;
  pivot: string;
  pivotId: number;
  recipient: string | null;
  pivotX: number;
  pivotY: number;
  v1: { dx: number; dy: number };
  v2: { dx: number; dy: number };
  outcome: PassOutcome;
  xtDelta: number;
}

export interface PassingCompassData {
  matchId: number;
  teams: string[];
  passes: PassRecord[];
  triangles: TriangleRecord[];
}
