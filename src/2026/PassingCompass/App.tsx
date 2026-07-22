import { useMemo, useState } from "react";
import { useData } from "./useData";
import PassingCompassChart from "./PassingCompassChart";
import type { PassOutcome } from "./types";
import "./App.css";

const OUTCOME_LEGEND: { outcome: PassOutcome; label: string; varName: string }[] = [
  { outcome: "Complete", label: "Complete", varName: "--status-good" },
  { outcome: "Incomplete", label: "Incomplete", varName: "--status-critical" },
  { outcome: "Out", label: "Out of play", varName: "--status-serious" },
  { outcome: "Pass Offside", label: "Offside", varName: "--status-warning" },
  { outcome: "Unknown", label: "Unknown", varName: "--muted" },
];

export default function App() {
  const data = useData();
  const [mode, setMode] = useState<"compass" | "chain" | "relative">("compass");
  const [team, setTeam] = useState<string>("Argentina");
  const [player, setPlayer] = useState<string>("__all__");
  const [alignReceive, setAlignReceive] = useState(false);

  const players = useMemo(() => {
    if (!data) return [];
    const names = new Set<string>();
    data.passes.forEach((p) => {
      if (p.team === team) names.add(p.player);
    });
    return Array.from(names).sort();
  }, [data, team]);

  const filteredPasses = useMemo(() => {
    if (!data) return [];
    return data.passes.filter(
      (p) => p.team === team && (player === "__all__" || p.player === player)
    );
  }, [data, team, player]);

  const filteredTriangles = useMemo(() => {
    if (!data) return [];
    return data.triangles.filter(
      (t) => t.team === team && (player === "__all__" || t.pivot === player)
    );
  }, [data, team, player]);

  if (!data) return <div className="pc-loading">Loading match data…</div>;

  return (
    <div className="pc-root">
      <header className="pc-header">
        <h1 className="pc-title">Passing Compass</h1>
        <p className="pc-subtitle">
          2022 World Cup Final — Argentina vs. France. Every pass, normalized to a
          shared origin so direction and length are directly comparable instead of
          scattered across the pitch.
        </p>
      </header>

      <div className="pc-controls">
        <div className="pc-toggle">
          {data.teams.map((t) => (
            <button
              key={t}
              className={`pc-toggle-btn ${team === t ? "active" : ""}`}
              onClick={() => {
                setTeam(t);
                setPlayer("__all__");
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <select
          className="pc-player-select"
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
        >
          <option value="__all__">All players</option>
          {players.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <div className="pc-toggle">
          <button
            className={`pc-toggle-btn ${mode === "compass" ? "active" : ""}`}
            onClick={() => setMode("compass")}
          >
            Compass
          </button>
          <button
            className={`pc-toggle-btn ${mode === "chain" ? "active" : ""}`}
            onClick={() => setMode("chain")}
          >
            Pivot chain
          </button>
          <button
            className={`pc-toggle-btn ${mode === "relative" ? "active" : ""}`}
            onClick={() => setMode("relative")}
          >
            Relative to player
          </button>
        </div>

        {mode === "relative" && (
          <label className="pc-checkbox">
            <input
              type="checkbox"
              checked={alignReceive}
              onChange={(e) => setAlignReceive(e.target.checked)}
            />
            Align: incoming pass always from the left
          </label>
        )}
      </div>

      <div className="pc-chart-area">
        <PassingCompassChart
          mode={mode}
          passes={filteredPasses}
          triangles={filteredTriangles}
          alignReceive={alignReceive}
        />

        <div className="pc-legend">
          {OUTCOME_LEGEND.map((item) => (
            <div key={item.outcome} className="pc-legend-item">
              <span className="pc-legend-swatch" style={{ background: `var(${item.varName})` }} />
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <p className="pc-footnote">
        {mode === "compass" &&
          `Showing ${filteredPasses.length} pass attempts. Each line runs from the shared origin to that pass's true direction and length in meters; forward (the attacking direction) points up.`}
        {mode === "chain" &&
          `Showing ${filteredTriangles.length} two-pass pivot chains (completed pass 1, into the same player who then plays pass 2). The path traces vector-added start → pivot → end from a shared origin.`}
        {mode === "relative" && !alignReceive &&
          `Showing ${filteredTriangles.length} pivot triangles centered on the receiving player. Each triangle's two outer points are where the incoming pass came from and where the outgoing pass went — fills are very transparent so common receive-and-release shapes build up density where they overlap.`}
        {mode === "relative" && alignReceive &&
          `Showing ${filteredTriangles.length} pivot triangles, each rotated so the incoming pass always arrives from the left — this removes absolute pitch direction and isolates each player's typical turn angle and pass lengths on receipt.`}
        {" "}Data: <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noopener noreferrer">StatsBomb open data</a>.
      </p>
    </div>
  );
}
