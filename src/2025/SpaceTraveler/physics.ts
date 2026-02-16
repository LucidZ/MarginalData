import { Vector2D, TrajectoryResult } from "./types";

// Constants
const G_ACCEL = 9.80665; // m/s^2
const AU_TO_M = 149597870700; // meters per AU
const SPEED_OF_LIGHT = 299792458; // m/s

/**
 * Calculate distance between two points
 */
export function distance(p1: Vector2D, p2: Vector2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate brachistochrone travel time for constant acceleration
 *
 * For constant acceleration to midpoint, then constant deceleration:
 * distance = a * t^2 (total distance with symmetric accel/decel)
 * solving for t: t = sqrt(2 * distance / acceleration)
 *
 * @param distanceM - distance in meters
 * @param accelerationG - acceleration in G's
 * @returns time in seconds
 */
export function calculateBrachistochroneTime(
  distanceM: number,
  accelerationG: number
): number {
  const accelMS2 = accelerationG * G_ACCEL;
  // For symmetric acceleration/deceleration, total time is:
  // t = 2 * sqrt(d / a) where d is distance and a is acceleration
  const timeSeconds = 2 * Math.sqrt(distanceM / accelMS2);
  return timeSeconds;
}

/**
 * Calculate maximum velocity at flip point
 * v = a * t_half
 */
export function calculateMaxVelocity(
  distanceM: number,
  accelerationG: number
): number {
  const accelMS2 = accelerationG * G_ACCEL;
  const halfTime = Math.sqrt(distanceM / accelMS2);
  return accelMS2 * halfTime;
}

/**
 * Convert velocity to fraction of speed of light
 */
export function velocityAsFractionOfC(velocityMS: number): number {
  return velocityMS / SPEED_OF_LIGHT;
}

/**
 * Iteratively solve for trajectory to intercept moving target planet
 *
 * @param startPos - Starting planet position (AU)
 * @param getEndPosAtTime - Function to get end planet position at a given time (days from start)
 * @param accelerationG - Acceleration in G's
 * @param maxIterations - Maximum iterations to prevent infinite loops
 * @param tolerance - Convergence tolerance in days
 * @returns Trajectory result
 */
export function solveTrajectory(
  startPos: Vector2D,
  getEndPosAtTime: (days: number) => Vector2D,
  accelerationG: number,
  maxIterations = 50,
  tolerance = 0.01 // 0.01 days ~= 14 minutes
): TrajectoryResult {
  let travelTimeDays = 0;
  let endPos = getEndPosAtTime(0);
  let iterations = 0;
  let converged = false;

  // Initial guess: travel time based on initial positions
  let distAU = distance(startPos, endPos);
  let distM = distAU * AU_TO_M;
  travelTimeDays = calculateBrachistochroneTime(distM, accelerationG) / 86400; // convert to days

  // Iterate to find where end planet will be when we arrive
  for (let i = 0; i < maxIterations; i++) {
    iterations = i + 1;

    // Get end planet position at our estimated arrival time
    endPos = getEndPosAtTime(travelTimeDays);

    // Calculate new distance and travel time
    distAU = distance(startPos, endPos);
    distM = distAU * AU_TO_M;
    const newTravelTimeDays =
      calculateBrachistochroneTime(distM, accelerationG) / 86400;

    // Check for convergence
    if (Math.abs(newTravelTimeDays - travelTimeDays) < tolerance) {
      converged = true;
      travelTimeDays = newTravelTimeDays;
      break;
    }

    travelTimeDays = newTravelTimeDays;
  }

  // Final calculations
  const finalDistAU = distance(startPos, endPos);
  const finalDistM = finalDistAU * AU_TO_M;
  const maxVelocity = calculateMaxVelocity(finalDistM, accelerationG);
  const flipTimeDays = travelTimeDays / 2;

  return {
    startPosition: startPos,
    endPosition: endPos,
    distance: finalDistM,
    travelTime: travelTimeDays,
    flipTime: flipTimeDays,
    maxVelocity,
    converged,
    iterations,
  };
}

/**
 * Get spacecraft position along trajectory at a given time
 *
 * @param trajectory - The calculated trajectory
 * @param elapsedDays - Time elapsed since start
 * @param accelerationG - Acceleration in G's
 * @param startOrbitalVelocity - Initial orbital velocity of starting planet (m/s)
 * @returns Current position in AU and velocity information
 */
export function getSpacecraftPosition(
  trajectory: TrajectoryResult,
  elapsedDays: number,
  accelerationG: number,
  startOrbitalVelocity: Vector2D = { x: 0, y: 0 }
): {
  position: Vector2D;
  thrustVelocity: number; // velocity from thrust only (m/s)
  totalVelocity: number; // total velocity relative to sun (m/s)
  velocityVector: Vector2D; // total velocity vector (m/s)
  isAccelerating: boolean;
} {
  const { startPosition, endPosition, travelTime, flipTime } = trajectory;

  // Clamp elapsed time
  const t = Math.max(0, Math.min(elapsedDays, travelTime));

  // Direction vector
  const dx = endPosition.x - startPosition.x;
  const dy = endPosition.y - startPosition.y;
  const totalDist = Math.sqrt(dx * dx + dy * dy);
  const dirX = dx / totalDist;
  const dirY = dy / totalDist;

  const accelMS2 = accelerationG * G_ACCEL;
  const tSeconds = t * 86400; // convert days to seconds

  let distanceTraveled: number;
  let thrustVelocity: number; // velocity from thrust only
  let isAccelerating: boolean;

  if (t <= flipTime) {
    // Accelerating phase
    const tAccel = tSeconds;
    distanceTraveled = 0.5 * accelMS2 * tAccel * tAccel;
    thrustVelocity = accelMS2 * tAccel;
    isAccelerating = true;
  } else {
    // Decelerating phase
    const flipTimeSeconds = flipTime * 86400;
    const distAtFlip = 0.5 * accelMS2 * flipTimeSeconds * flipTimeSeconds;
    const maxVel = accelMS2 * flipTimeSeconds;

    const tDecel = tSeconds - flipTimeSeconds;
    const decelDist = maxVel * tDecel - 0.5 * accelMS2 * tDecel * tDecel;

    distanceTraveled = distAtFlip + decelDist;
    thrustVelocity = maxVel - accelMS2 * tDecel;
    isAccelerating = false;
  }

  // Convert distance from meters to AU
  const distanceAU = distanceTraveled / AU_TO_M;

  // Calculate thrust velocity vector (in direction of travel)
  const thrustVelX = dirX * thrustVelocity;
  const thrustVelY = dirY * thrustVelocity;

  // Add orbital velocity of starting planet to get total velocity
  const totalVelX = startOrbitalVelocity.x + thrustVelX;
  const totalVelY = startOrbitalVelocity.y + thrustVelY;
  const totalVelocity = Math.sqrt(totalVelX * totalVelX + totalVelY * totalVelY);

  return {
    position: {
      x: startPosition.x + dirX * distanceAU,
      y: startPosition.y + dirY * distanceAU,
    },
    thrustVelocity,
    totalVelocity,
    velocityVector: { x: totalVelX, y: totalVelY },
    isAccelerating,
  };
}
