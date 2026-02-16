import * as Astronomy from "astronomy-engine";
import { Vector2D, PlanetName, PlanetInfo } from "./types";

// Planet visual properties
export const PLANET_COLORS: Record<PlanetName, string> = {
  Mercury: "#8C7853",
  Venus: "#FFC649",
  Earth: "#4A90E2",
  Mars: "#E27B58",
  Jupiter: "#C88B3A",
  Saturn: "#FAD5A5",
  Uranus: "#4FD0E7",
  Neptune: "#4166F5",
};

export const PLANET_RADII: Record<PlanetName, number> = {
  // Visual radii in pixels (not to scale!)
  Mercury: 3,
  Venus: 5,
  Earth: 5,
  Mars: 4,
  Jupiter: 8,
  Saturn: 7,
  Uranus: 6,
  Neptune: 6,
};

export const SUN_COLOR = "#FDB813";
export const SUN_RADIUS = 10;

/**
 * Convert astronomy-engine body name to our PlanetName type
 */
function toPlanetName(body: Astronomy.Body): PlanetName {
  const name = body as string;
  if (
    name === "Mercury" ||
    name === "Venus" ||
    name === "Earth" ||
    name === "Mars" ||
    name === "Jupiter" ||
    name === "Saturn" ||
    name === "Uranus" ||
    name === "Neptune"
  ) {
    return name;
  }
  throw new Error(`Invalid planet name: ${name}`);
}

/**
 * Get heliocentric position of a planet at a given date
 * Returns position in AU with Sun at origin
 */
export function getPlanetPosition(
  planet: PlanetName,
  date: Date
): Vector2D {
  const body = planet as unknown as Astronomy.Body;
  const vector = Astronomy.HelioVector(body, date);

  // Return x, y coordinates (ignoring z for 2D visualization)
  return {
    x: vector.x,
    y: vector.y,
  };
}

/**
 * Get all planet positions at a given date
 */
export function getAllPlanetPositions(date: Date): Map<PlanetName, Vector2D> {
  const positions = new Map<PlanetName, Vector2D>();

  const planets: PlanetName[] = [
    "Mercury",
    "Venus",
    "Earth",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
  ];

  for (const planet of planets) {
    positions.set(planet, getPlanetPosition(planet, date));
  }

  return positions;
}

/**
 * Get planet info including position and visual properties
 */
export function getPlanetInfo(planet: PlanetName, date: Date): PlanetInfo {
  return {
    name: planet,
    position: getPlanetPosition(planet, date),
    color: PLANET_COLORS[planet],
    radius: PLANET_RADII[planet],
  };
}

/**
 * Calculate orbital period of a planet (approximate, in days)
 */
export const ORBITAL_PERIODS: Record<PlanetName, number> = {
  Mercury: 88,
  Venus: 225,
  Earth: 365.25,
  Mars: 687,
  Jupiter: 4333,
  Saturn: 10759,
  Uranus: 30687,
  Neptune: 60190,
};

/**
 * Get mean orbital radius (semi-major axis) in AU
 */
export const ORBITAL_RADII: Record<PlanetName, number> = {
  Mercury: 0.387,
  Venus: 0.723,
  Earth: 1.0,
  Mars: 1.524,
  Jupiter: 5.203,
  Saturn: 9.537,
  Uranus: 19.191,
  Neptune: 30.069,
};
