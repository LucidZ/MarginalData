import * as Astronomy from "astronomy-engine";
import { Vector2D, PlanetName } from "./types";

const AU_TO_M = 149597870700; // meters per AU

/**
 * Calculate orbital velocity of a planet at a given date
 * Returns velocity vector in m/s (heliocentric)
 */
export function getPlanetVelocity(planet: PlanetName, date: Date): Vector2D {
  const body = planet as unknown as Astronomy.Body;

  // Get position at current time
  const pos1 = Astronomy.HelioVector(body, date);

  // Get position 1 hour later
  const date2 = new Date(date.getTime() + 3600000); // +1 hour in ms
  const pos2 = Astronomy.HelioVector(body, date2);

  // Calculate velocity (change in position / change in time)
  const dx = (pos2.x - pos1.x) * AU_TO_M; // convert AU to meters
  const dy = (pos2.y - pos1.y) * AU_TO_M;
  const dt = 3600; // 1 hour in seconds

  return {
    x: dx / dt, // m/s
    y: dy / dt, // m/s
  };
}

/**
 * Calculate magnitude of a velocity vector
 */
export function velocityMagnitude(velocity: Vector2D): number {
  return Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
}

/**
 * Add two velocity vectors
 */
export function addVelocities(v1: Vector2D, v2: Vector2D): Vector2D {
  return {
    x: v1.x + v2.x,
    y: v1.y + v2.y,
  };
}
