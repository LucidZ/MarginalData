import { useMemo, useState } from "react";
import { useData } from "../PassingCompass/useData";
import PitchChart from "../PassingCompass/PitchChart";
import PlayerAvatar from "./PlayerAvatar";
import { ROSTER } from "./roster";
import type { GamePitch, Assignments } from "./types";
import "../PassingCompass/App.css";
import "./App.css";

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function App() {
  const data = useData();
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignments>({});
  const [checked, setChecked] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const pitches: GamePitch[] = useMemo(() => {
    if (!data) return [];
    const order = shuffled(ROSTER);
    return order.map((player, i) => ({
      id: player.fullName,
      label: `Pitch ${String.fromCharCode(65 + i)}`,
      correctFullName: player.fullName,
      triangles: data.triangles.filter(
        (t) => t.team === "Argentina" && t.pivot === player.fullName
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, shuffleSeed]);

  const assignedNames = useMemo(
    () => new Set(Object.values(assignments).filter((v): v is string => v !== null)),
    [assignments]
  );

  const availablePlayers = ROSTER.filter((p) => !assignedNames.has(p.fullName));
  const allAssigned = pitches.length > 0 && pitches.every((p) => assignments[p.id]);
  const score = pitches.filter((p) => assignments[p.id] === p.correctFullName).length;

  const handleCardClick = (fullName: string) => {
    setSelectedPlayer((prev) => (prev === fullName ? null : fullName));
  };

  const handlePitchClick = (pitchId: string) => {
    const current = assignments[pitchId] ?? null;
    setChecked(false);
    if (selectedPlayer) {
      setAssignments((prev) => ({ ...prev, [pitchId]: selectedPlayer }));
      setSelectedPlayer(null);
    } else if (current) {
      setAssignments((prev) => ({ ...prev, [pitchId]: null }));
      setSelectedPlayer(current);
    }
  };

  const handleReset = () => {
    setAssignments({});
    setSelectedPlayer(null);
    setChecked(false);
    setShuffleSeed((s) => s + 1);
  };

  if (!data) return <div className="ptmg-loading">Loading match data…</div>;

  const playerByName = new Map(ROSTER.map((p) => [p.fullName, p]));

  return (
    <div className="ptmg-root">
      <header className="ptmg-header">
        <h1 className="ptmg-title">Passing Triangle Matching Game</h1>
        <p className="ptmg-subtitle">
          Every pass Argentina completed in the 2022 World Cup Final traces a
          "pivot triangle" through the player who received it and passed it
          on. Pick a player below, then click the pitch you think is theirs —
          each pitch plots that one player's pivot triangles at their real
          on-field location.
        </p>
      </header>

      <section className="ptmg-roster" aria-live="polite">
        <h2 className="ptmg-section-title">
          {availablePlayers.length > 0
            ? `Players to place (${availablePlayers.length} left)`
            : "All players placed"}
        </h2>
        <div className="ptmg-roster-grid">
          {availablePlayers.map((p) => (
            <button
              key={p.fullName}
              className={`ptmg-card ${selectedPlayer === p.fullName ? "selected" : ""}`}
              onClick={() => handleCardClick(p.fullName)}
            >
              <PlayerAvatar number={p.number} />
              <span className="ptmg-card-name">{p.displayName}</span>
            </button>
          ))}
        </div>
        {selectedPlayer && (
          <p className="ptmg-hint">
            Selected: <strong>{playerByName.get(selectedPlayer)?.displayName}</strong> — click a pitch below to place them.
          </p>
        )}
      </section>

      <section className="ptmg-pitches">
        <div className="ptmg-pitches-grid">
          {pitches.map((pitch) => {
            const assignedName = assignments[pitch.id] ?? null;
            const assignedPlayer = assignedName ? playerByName.get(assignedName) : null;
            const isCorrect = checked && assignedName === pitch.correctFullName;
            const isWrong = checked && assignedName !== null && assignedName !== pitch.correctFullName;
            const correctPlayer = playerByName.get(pitch.correctFullName);

            return (
              <div
                key={pitch.id}
                className={`ptmg-slot ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""} ${
                  selectedPlayer ? "targetable" : ""
                }`}
                onClick={() => handlePitchClick(pitch.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handlePitchClick(pitch.id);
                }}
              >
                <div className="ptmg-slot-label">{pitch.label}</div>
                <PitchChart triangles={pitch.triangles} interactive={checked} />
                <div className="ptmg-slot-footer">
                  {assignedPlayer ? (
                    <span className="ptmg-slot-assigned">
                      <PlayerAvatar number={assignedPlayer.number} size={28} />
                      {assignedPlayer.displayName}
                    </span>
                  ) : (
                    <span className="ptmg-slot-empty">
                      {selectedPlayer ? "Click to place selected player" : "Empty"}
                    </span>
                  )}
                  {isCorrect && <span className="ptmg-result correct">Correct ✓</span>}
                  {isWrong && (
                    <span className="ptmg-result wrong">
                      Actually {correctPlayer?.displayName} ✗
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="ptmg-actions">
        <button
          className="ptmg-btn primary"
          disabled={!allAssigned}
          onClick={() => setChecked(true)}
        >
          Check answers
        </button>
        <button className="ptmg-btn" onClick={handleReset}>
          Reset
        </button>
        {checked && (
          <span className="ptmg-score">
            Score: {score} / {pitches.length}
          </span>
        )}
        {!allAssigned && (
          <span className="ptmg-hint-inline">
            Place all {pitches.length} players to check your answers.
          </span>
        )}
      </div>

      <p className="ptmg-footnote">
        Data: <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noopener noreferrer">StatsBomb open data</a>,
        {" "}2022 World Cup Final, Argentina vs. France.
      </p>
    </div>
  );
}
