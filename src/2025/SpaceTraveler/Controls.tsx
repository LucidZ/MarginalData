import { PlanetName } from "./types";

interface ControlsProps {
  startPlanet: PlanetName;
  endPlanet: PlanetName;
  accelerationG: number;
  onStartPlanetChange: (planet: PlanetName) => void;
  onEndPlanetChange: (planet: PlanetName) => void;
  onAccelerationChange: (g: number) => void;
}

const PLANETS: PlanetName[] = [
  "Mercury",
  "Venus",
  "Earth",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
];

export default function Controls({
  startPlanet,
  endPlanet,
  accelerationG,
  onStartPlanetChange,
  onEndPlanetChange,
  onAccelerationChange,
}: ControlsProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "30px",
        padding: "20px",
        backgroundColor: "#111",
        borderRadius: "8px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <label
          htmlFor="start-planet"
          style={{ display: "block", marginBottom: "8px", color: "#CCC" }}
        >
          Start Planet
        </label>
        <select
          id="start-planet"
          value={startPlanet}
          onChange={(e) => onStartPlanetChange(e.target.value as PlanetName)}
          style={{
            padding: "8px 12px",
            fontSize: "16px",
            backgroundColor: "#222",
            color: "#FFF",
            border: "1px solid #444",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {PLANETS.map((planet) => (
            <option key={planet} value={planet}>
              {planet}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="end-planet"
          style={{ display: "block", marginBottom: "8px", color: "#CCC" }}
        >
          Destination Planet
        </label>
        <select
          id="end-planet"
          value={endPlanet}
          onChange={(e) => onEndPlanetChange(e.target.value as PlanetName)}
          style={{
            padding: "8px 12px",
            fontSize: "16px",
            backgroundColor: "#222",
            color: "#FFF",
            border: "1px solid #444",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {PLANETS.map((planet) => (
            <option key={planet} value={planet}>
              {planet}
            </option>
          ))}
        </select>
      </div>

      <div style={{ flex: "1", minWidth: "300px" }}>
        <label
          htmlFor="acceleration"
          style={{ display: "block", marginBottom: "8px", color: "#CCC" }}
        >
          Acceleration: {accelerationG.toFixed(2)} G
        </label>
        <input
          id="acceleration"
          type="range"
          min="0.1"
          max="5"
          step="0.1"
          value={accelerationG}
          onChange={(e) => onAccelerationChange(parseFloat(e.target.value))}
          style={{
            width: "100%",
            height: "8px",
            borderRadius: "4px",
            outline: "none",
            cursor: "pointer",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "#888",
            marginTop: "4px",
          }}
        >
          <span>0.1 G</span>
          <span>5.0 G</span>
        </div>
      </div>
    </div>
  );
}
