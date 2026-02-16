import { TrajectoryResult } from "./types";
import { velocityAsFractionOfC } from "./physics";

interface StatsProps {
  trajectory: TrajectoryResult | null;
  currentTime: number;
  currentVelocity: number; // total velocity relative to sun
  thrustVelocity: number; // velocity from thrust only
  startDate: Date;
}

function formatDuration(days: number): string {
  const wholeDays = Math.floor(days);
  const hours = Math.floor((days - wholeDays) * 24);
  return `${wholeDays} days, ${hours} hours`;
}

function formatDistance(meters: number): string {
  const au = meters / 149597870700;
  return `${au.toFixed(4)} AU (${(meters / 1e9).toFixed(2)} million km)`;
}

function formatVelocity(ms: number): string {
  const kmh = (ms * 3.6).toFixed(0);
  const fractionOfC = velocityAsFractionOfC(ms);
  return `${kmh.toLocaleString()} km/h (${(fractionOfC * 100).toFixed(4)}% c)`;
}

export default function Stats({
  trajectory,
  currentTime,
  currentVelocity,
  thrustVelocity,
  startDate,
}: StatsProps) {
  if (!trajectory) {
    return (
      <div
        style={{
          padding: "20px",
          backgroundColor: "#111",
          borderRadius: "8px",
          color: "#CCC",
        }}
      >
        <p>Calculating trajectory...</p>
      </div>
    );
  }

  const currentDate = new Date(startDate.getTime() + currentTime * 86400000);
  const arrivalDate = new Date(
    startDate.getTime() + trajectory.travelTime * 86400000
  );

  return (
    <div
      style={{
        padding: "20px",
        backgroundColor: "#111",
        borderRadius: "8px",
        color: "#CCC",
      }}
    >
      <h3 style={{ marginTop: 0, color: "#FFF" }}>Journey Statistics</h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "20px",
        }}
      >
        <div>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
            Total Duration
          </div>
          <div style={{ fontSize: "18px", color: "#FFF" }}>
            {formatDuration(trajectory.travelTime)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
            Distance
          </div>
          <div style={{ fontSize: "18px", color: "#FFF" }}>
            {formatDistance(trajectory.distance)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
            Max Velocity (at flip)
          </div>
          <div style={{ fontSize: "18px", color: "#FFF" }}>
            {formatVelocity(trajectory.maxVelocity)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
            Current Velocity (total)
          </div>
          <div
            style={{
              fontSize: "18px",
              color: currentTime < trajectory.travelTime ? "#0F0" : "#FFF",
            }}
          >
            {formatVelocity(currentVelocity)}
          </div>
          <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
            Includes orbital velocity
          </div>
        </div>

        <div>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
            Thrust Velocity
          </div>
          <div
            style={{
              fontSize: "18px",
              color: currentTime < trajectory.travelTime ? "#4A90E2" : "#FFF",
            }}
          >
            {formatVelocity(thrustVelocity)}
          </div>
          <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
            From acceleration only
          </div>
        </div>

        <div>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
            Elapsed Time
          </div>
          <div style={{ fontSize: "18px", color: "#FFF" }}>
            {formatDuration(Math.min(currentTime, trajectory.travelTime))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
            Remaining Time
          </div>
          <div style={{ fontSize: "18px", color: "#FFF" }}>
            {formatDuration(
              Math.max(0, trajectory.travelTime - currentTime)
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
            Current Date
          </div>
          <div style={{ fontSize: "14px", color: "#FFF" }}>
            {currentDate.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
            Arrival Date
          </div>
          <div style={{ fontSize: "14px", color: "#FFF" }}>
            {arrivalDate.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
      </div>

      {!trajectory.converged && (
        <div
          style={{
            marginTop: "20px",
            padding: "10px",
            backgroundColor: "#442",
            borderRadius: "4px",
            color: "#FCC",
          }}
        >
          Warning: Trajectory calculation did not fully converge after{" "}
          {trajectory.iterations} iterations.
        </div>
      )}
    </div>
  );
}
