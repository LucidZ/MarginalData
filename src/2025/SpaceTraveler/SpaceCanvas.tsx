import { useEffect, useRef } from "react";
import { Vector2D, PlanetName, TrajectoryResult } from "./types";
import {
  getPlanetPosition,
  PLANET_COLORS,
  PLANET_RADII,
  SUN_COLOR,
  SUN_RADIUS,
  ORBITAL_RADII,
} from "./planets";

interface SpaceCanvasProps {
  startPlanet: PlanetName;
  endPlanet: PlanetName;
  startDate: Date;
  trajectory: TrajectoryResult | null;
  currentTime: number; // elapsed days
  accelerationG: number;
  isPlaying: boolean;
  spacecraftPosition: Vector2D | null;
  isAccelerating: boolean;
}

export default function SpaceCanvas({
  startPlanet,
  endPlanet,
  startDate,
  trajectory,
  currentTime,
  accelerationG,
  isPlaying,
  spacecraftPosition,
  isAccelerating,
}: SpaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    // Calculate FIXED view bounds based on trajectory endpoints
    // This keeps the view stable throughout the animation
    const positions: Vector2D[] = [{ x: 0, y: 0 }]; // Include sun

    if (trajectory) {
      // Use trajectory start and end positions (fixed throughout journey)
      positions.push(trajectory.startPosition, trajectory.endPosition);

      // Also include start and end positions of both planets at journey start and end
      // to ensure we see their full orbital arcs
      const startPlanetStart = getPlanetPosition(startPlanet, startDate);
      const startPlanetEnd = getPlanetPosition(
        startPlanet,
        new Date(startDate.getTime() + trajectory.travelTime * 86400000)
      );
      const endPlanetStart = getPlanetPosition(endPlanet, startDate);
      const endPlanetEnd = getPlanetPosition(
        endPlanet,
        new Date(startDate.getTime() + trajectory.travelTime * 86400000)
      );

      positions.push(startPlanetStart, startPlanetEnd, endPlanetStart, endPlanetEnd);
    }

    // Calculate bounds
    const xValues = positions.map((p) => p.x);
    const yValues = positions.map((p) => p.y);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    // Add padding (20%)
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const paddingX = rangeX * 0.2;
    const paddingY = rangeY * 0.2;

    const viewMinX = minX - paddingX;
    const viewMaxX = maxX + paddingX;
    const viewMinY = minY - paddingY;
    const viewMaxY = maxY + paddingY;

    const viewWidth = viewMaxX - viewMinX;
    const viewHeight = viewMaxY - viewMinY;

    // Calculate scale to fit in canvas (maintain aspect ratio)
    const scaleX = width / viewWidth;
    const scaleY = height / viewHeight;
    const scale = Math.min(scaleX, scaleY);

    // Center the view
    const offsetX = (width - viewWidth * scale) / 2 - viewMinX * scale;
    const offsetY = (height - viewHeight * scale) / 2 - viewMinY * scale;

    // Helper function to transform AU coordinates to canvas pixels
    const toCanvas = (pos: Vector2D): { x: number; y: number } => ({
      x: pos.x * scale + offsetX,
      y: pos.y * scale + offsetY,
    });

    // Draw orbital paths for planets in view
    const planetsToShow: PlanetName[] = [
      "Mercury",
      "Venus",
      "Earth",
      "Mars",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
    ];

    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    for (const planet of planetsToShow) {
      const radius = ORBITAL_RADII[planet];
      const centerCanvas = toCanvas({ x: 0, y: 0 });
      const radiusCanvas = radius * scale;

      ctx.beginPath();
      ctx.arc(centerCanvas.x, centerCanvas.y, radiusCanvas, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw Sun
    const sunCanvas = toCanvas({ x: 0, y: 0 });
    ctx.fillStyle = SUN_COLOR;
    ctx.beginPath();
    ctx.arc(sunCanvas.x, sunCanvas.y, SUN_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Draw trajectory line if available
    if (trajectory) {
      const startCanvas = toCanvas(trajectory.startPosition);
      const endCanvas = toCanvas(trajectory.endPosition);

      ctx.strokeStyle = "#888";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(startCanvas.x, startCanvas.y);
      ctx.lineTo(endCanvas.x, endCanvas.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw flip point
      const flipPos = {
        x:
          (trajectory.startPosition.x + trajectory.endPosition.x) / 2,
        y:
          (trajectory.startPosition.y + trajectory.endPosition.y) / 2,
      };
      const flipCanvas = toCanvas(flipPos);
      ctx.fillStyle = "#FF6B6B";
      ctx.beginPath();
      ctx.arc(flipCanvas.x, flipCanvas.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw planets at current time
    const currentDate = new Date(startDate.getTime() + currentTime * 86400000);

    for (const planet of planetsToShow) {
      const pos = getPlanetPosition(planet, currentDate);
      const canvasPos = toCanvas(pos);
      const color = PLANET_COLORS[planet];
      const radius = PLANET_RADII[planet];

      // Draw planet
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(canvasPos.x, canvasPos.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Draw label for start and end planets
      if (planet === startPlanet || planet === endPlanet) {
        ctx.fillStyle = "#FFF";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(planet, canvasPos.x, canvasPos.y - radius - 5);
      }
    }

    // Draw spacecraft if position is available
    if (spacecraftPosition) {
      const scPos = toCanvas(spacecraftPosition);

      // Draw spacecraft as a triangle
      ctx.fillStyle = isAccelerating ? "#00FF00" : "#FF9500";
      ctx.save();
      ctx.translate(scPos.x, scPos.y);

      // Rotate to point in direction of acceleration/thrust
      if (trajectory) {
        const dx = trajectory.endPosition.x - spacecraftPosition.x;
        const dy = trajectory.endPosition.y - spacecraftPosition.y;
        const angle = Math.atan2(dy, dx);

        // If decelerating, flip 180 degrees to point away from destination
        if (isAccelerating) {
          ctx.rotate(angle);
        } else {
          ctx.rotate(angle + Math.PI);
        }
      }

      // Draw triangle (pointing right)
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      // Draw trail
      ctx.strokeStyle = isAccelerating
        ? "rgba(0, 255, 0, 0.3)"
        : "rgba(255, 149, 0, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startCanvas = toCanvas(trajectory!.startPosition);
      ctx.moveTo(startCanvas.x, startCanvas.y);
      ctx.lineTo(scPos.x, scPos.y);
      ctx.stroke();
    }

    // Draw scale indicator
    const scaleAU = 1; // 1 AU
    const scalePixels = scaleAU * scale;
    const scaleBarX = width - 100;
    const scaleBarY = height - 30;

    ctx.strokeStyle = "#FFF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleBarX, scaleBarY);
    ctx.lineTo(scaleBarX + scalePixels, scaleBarY);
    ctx.stroke();

    // Draw scale ticks
    ctx.beginPath();
    ctx.moveTo(scaleBarX, scaleBarY - 5);
    ctx.lineTo(scaleBarX, scaleBarY + 5);
    ctx.moveTo(scaleBarX + scalePixels, scaleBarY - 5);
    ctx.lineTo(scaleBarX + scalePixels, scaleBarY + 5);
    ctx.stroke();

    // Draw scale label
    ctx.fillStyle = "#FFF";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("1 AU", scaleBarX + scalePixels / 2, scaleBarY - 10);
  }, [
    startPlanet,
    endPlanet,
    startDate,
    trajectory,
    currentTime,
    spacecraftPosition,
    isAccelerating,
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "600px",
        border: "1px solid #333",
      }}
    />
  );
}
