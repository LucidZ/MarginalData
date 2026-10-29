// Shared by the lane widgets.

// Top to bottom. Cars drive left to right, so the top lane is the driver's
// left: fast lane on top, like a real passing lane.
export const SPEEDS_MPH = [70, 60, 50, 40, 30, 20, 10];
export const MPS_PER_MPH = 0.44704;
export const FT_PER_M = 3.28084;
export const M_PER_MI = 1609.344;
export const CAR_M = 4.5;
export const FLASH_S = 0.15;

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
