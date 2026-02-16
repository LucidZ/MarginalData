export interface Vector2D {
  x: number;
  y: number;
}

export interface PlanetInfo {
  name: string;
  position: Vector2D;
  color: string;
  radius: number;
}

export interface TrajectoryResult {
  startPosition: Vector2D;
  endPosition: Vector2D;
  distance: number;
  travelTime: number; // in days
  flipTime: number; // time to flip point in days
  maxVelocity: number; // in m/s
  converged: boolean;
  iterations: number;
}

export interface AnimationState {
  isPlaying: boolean;
  currentTime: number; // elapsed time in days
  speed: number; // animation speed multiplier
}

export type PlanetName =
  | "Mercury"
  | "Venus"
  | "Earth"
  | "Mars"
  | "Jupiter"
  | "Saturn"
  | "Uranus"
  | "Neptune";
