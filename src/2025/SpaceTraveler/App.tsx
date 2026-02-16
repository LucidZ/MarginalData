import { useState, useEffect, useCallback } from "react";
import { PlanetName, TrajectoryResult } from "./types";
import { getPlanetPosition } from "./planets";
import { solveTrajectory, getSpacecraftPosition } from "./physics";
import { getPlanetVelocity } from "./orbitalVelocity";
import SpaceCanvas from "./SpaceCanvas";
import Controls from "./Controls";
import Stats from "./Stats";
import AnimationControls from "./AnimationControls";

export default function App() {
  // Journey parameters
  const [startPlanet, setStartPlanet] = useState<PlanetName>("Earth");
  const [endPlanet, setEndPlanet] = useState<PlanetName>("Mars");
  const [accelerationG, setAccelerationG] = useState<number>(1.0);
  const [startDate] = useState<Date>(new Date(2026, 1, 16)); // Feb 16, 2026

  // Trajectory calculation
  const [trajectory, setTrajectory] = useState<TrajectoryResult | null>(null);

  // Animation state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // elapsed days
  const [animationSpeed, setAnimationSpeed] = useState(6); // hours per second (converted to days/sec in animation loop)

  // Recalculate trajectory when parameters change
  useEffect(() => {
    if (startPlanet === endPlanet) {
      setTrajectory(null);
      return;
    }

    const startPos = getPlanetPosition(startPlanet, startDate);

    // Function to get end planet position at a given time offset
    const getEndPosAtTime = (days: number) => {
      const futureDate = new Date(startDate.getTime() + days * 86400000);
      return getPlanetPosition(endPlanet, futureDate);
    };

    const result = solveTrajectory(startPos, getEndPosAtTime, accelerationG);
    setTrajectory(result);

    // Reset animation
    setCurrentTime(0);
    setIsPlaying(false);
  }, [startPlanet, endPlanet, accelerationG, startDate]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !trajectory) return;

    const fps = 60;
    const interval = 1000 / fps;
    // Convert hours per second to days per frame
    const hoursPerSecond = animationSpeed;
    const daysPerSecond = hoursPerSecond / 24;
    const daysPerFrame = daysPerSecond / fps;

    const timer = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + daysPerFrame;
        if (next >= trajectory.travelTime) {
          setIsPlaying(false);
          return trajectory.travelTime;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [isPlaying, trajectory, animationSpeed]);

  // Get starting planet's orbital velocity
  const startOrbitalVelocity = getPlanetVelocity(startPlanet, startDate);

  // Get spacecraft position and velocity
  const spacecraftState = trajectory
    ? getSpacecraftPosition(trajectory, currentTime, accelerationG, startOrbitalVelocity)
    : null;

  const handlePlayPause = useCallback(() => {
    if (trajectory && currentTime >= trajectory.travelTime) {
      // If at the end, reset and play
      setCurrentTime(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  }, [trajectory, currentTime]);

  const handleReset = useCallback(() => {
    setCurrentTime(0);
    setIsPlaying(false);
  }, []);

  const handleProgressChange = useCallback((newProgress: number) => {
    if (trajectory) {
      setCurrentTime(newProgress * trajectory.travelTime);
      // Pause when manually scrubbing
      setIsPlaying(false);
    }
  }, [trajectory]);

  const progress = trajectory
    ? Math.min(currentTime / trajectory.travelTime, 1)
    : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#000",
        color: "#FFF",
        padding: "20px",
      }}
    >
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "10px" }}>
          Expanse-Style Space Travel Simulator
        </h1>
        <p
          style={{
            marginBottom: "30px",
            color: "#AAA",
            lineHeight: "1.6",
            maxWidth: "800px",
          }}
        >
          Calculate brachistochrone trajectories between planets with constant
          acceleration and deceleration, just like the ships in The Expanse.
          Select your start and destination planets, choose your acceleration,
          and watch the journey unfold in real time (well, sped up quite a
          bit).
        </p>
        <p
          style={{
            marginBottom: "30px",
            padding: "12px 16px",
            backgroundColor: "#332200",
            borderLeft: "4px solid #FFAA00",
            color: "#FFCC66",
            fontSize: "14px",
            lineHeight: "1.5",
            maxWidth: "800px",
            borderRadius: "4px",
          }}
        >
          ⚠️ <strong>For entertainment purposes only!</strong> This calculator
          ignores pesky details like planetary gravity wells, the Oberth effect,
          orbital mechanics, and relativistic effects. Please do not use this to
          plan actual interplanetary travel.
        </p>

        <div style={{ marginBottom: "20px" }}>
          <Controls
            startPlanet={startPlanet}
            endPlanet={endPlanet}
            accelerationG={accelerationG}
            onStartPlanetChange={setStartPlanet}
            onEndPlanetChange={setEndPlanet}
            onAccelerationChange={setAccelerationG}
          />
        </div>

        {startPlanet === endPlanet && (
          <div
            style={{
              padding: "20px",
              backgroundColor: "#442",
              borderRadius: "8px",
              color: "#FCC",
              marginBottom: "20px",
            }}
          >
            Please select different start and destination planets.
          </div>
        )}

        {trajectory && (
          <>
            <div style={{ marginBottom: "20px" }}>
              <SpaceCanvas
                startPlanet={startPlanet}
                endPlanet={endPlanet}
                startDate={startDate}
                trajectory={trajectory}
                currentTime={currentTime}
                accelerationG={accelerationG}
                isPlaying={isPlaying}
                spacecraftPosition={spacecraftState?.position || null}
                isAccelerating={spacecraftState?.isAccelerating || false}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <AnimationControls
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                onReset={handleReset}
                speed={animationSpeed}
                onSpeedChange={setAnimationSpeed}
                progress={progress}
                onProgressChange={handleProgressChange}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <Stats
                trajectory={trajectory}
                currentTime={currentTime}
                currentVelocity={spacecraftState?.totalVelocity || 0}
                thrustVelocity={spacecraftState?.thrustVelocity || 0}
                startDate={startDate}
              />
            </div>
          </>
        )}

        <div
          style={{
            marginTop: "40px",
            padding: "20px",
            backgroundColor: "#111",
            borderRadius: "8px",
            fontSize: "14px",
            lineHeight: "1.6",
            color: "#AAA",
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: "16px", color: "#FFF" }}>
            About This Simulation
          </h3>
          <p style={{ margin: "10px 0" }}>
            This simulation uses real planetary orbital data and brachistochrone
            trajectories (constant acceleration to midpoint, then constant
            deceleration). The spacecraft travels in a straight line to where
            the destination planet will be at arrival time.
          </p>
          <p style={{ margin: "10px 0" }}>
            <strong>Color coding:</strong> Green spacecraft = accelerating,
            Orange spacecraft = decelerating. The red dot marks the flip point
            where the ship rotates 180° to begin deceleration.
          </p>
          <p style={{ margin: "10px 0" }}>
            <strong>Planetary positions:</strong> Calculated using the
            astronomy-engine library with real ephemeris data.
          </p>
        </div>
      </div>
    </div>
  );
}
