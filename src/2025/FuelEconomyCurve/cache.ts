// Cache utility for storing API responses in localStorage
import type { ApiVehicle, FuelPrices } from "../FuelEconomyTool/api";

const CACHE_PREFIX = "fuelEconomyCurve_";
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function getCacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_DURATION;
}

// Generic cache get function
function getFromCache<T>(key: string): T | null {
  try {
    const cached = localStorage.getItem(getCacheKey(key));
    if (!cached) return null;

    const entry: CacheEntry<T> = JSON.parse(cached);
    if (!isCacheValid(entry.timestamp)) {
      // Cache expired, remove it
      localStorage.removeItem(getCacheKey(key));
      return null;
    }

    return entry.data;
  } catch (error) {
    console.warn(`Failed to read from cache: ${key}`, error);
    return null;
  }
}

// Generic cache set function
function setToCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(getCacheKey(key), JSON.stringify(entry));
  } catch (error) {
    console.warn(`Failed to write to cache: ${key}`, error);
  }
}

// Vehicle-specific cache functions
export function getCachedVehicle(vehicleId: number): ApiVehicle | null {
  return getFromCache<ApiVehicle>(`vehicle_${vehicleId}`);
}

export function setCachedVehicle(vehicleId: number, vehicle: ApiVehicle): void {
  setToCache(`vehicle_${vehicleId}`, vehicle);
}

// Fuel prices cache functions
export function getCachedFuelPrices(): FuelPrices | null {
  return getFromCache<FuelPrices>("fuelPrices");
}

export function setCachedFuelPrices(prices: FuelPrices): void {
  setToCache("fuelPrices", prices);
}

// Clear all cache (useful for debugging or force refresh)
export function clearCache(): void {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn("Failed to clear cache", error);
  }
}
