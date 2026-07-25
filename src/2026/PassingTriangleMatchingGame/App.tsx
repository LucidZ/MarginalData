import { useMemo, useState } from "react";
import { useData } from "../PassingCompass/useData";
import PitchChart from "../PassingCompass/PitchChart";
import type { PitchSlot, PitchSlotState } from "../PassingCompass/PitchChart";
import PlayerAvatar from "./PlayerAvatar";
import { ROSTER } from "./roster";
import type { GameSlot, Assignments } from "./types";
import "../PassingCompass/App.css";
import "./App.css";

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export default function App() {
  const data = useData();
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignments>({});
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const slots: GameSlot[] = useMemo(() => {
    if (!data) return [];
    return ROSTER.map((player) => {
      const pivots = data.triangles.filter(
        (t) => t.team === "Argentina" && t.pivot === player.fullName
      );
      return {
        id: player.fullName,
        x: mean(pivots.map((t) => t.pivotX)),
        y: mean(pivots.map((t) => t.pivotY)),
        correctFullName: player.fullName,
      };
    });
  }, [data]);

  const activeTriangles = useMemo(() => {
    if (!data || !activeSlotId) return [];
    return data.triangles.filter(
      (t) => t.team === "Argentina" && t.pivot === activeSlotId
    );
  }, [data, activeSlotId]);

  const assignedNames = useMemo(
    () => new Set(Object.values(assignments).filter((v): v is string => v !== null)),
    [assignments]
  );

  const availablePlayers = ROSTER.filter((p) => !assignedNames.has(p.fullName));
  const allAssigned = slots.length > 0 && slots.every((s) => assignments[s.id]);
  const score = slots.filter((s) => assignments[s.id] === s.correctFullName).length;

  const handleCardClick = (fullName: string) => {
    setSelectedPlayer((prev) => (prev === fullName ? null : fullName));
  };

  const handleSlotClick = (slotId: string) => {
    if (selectedPlayer) {
      setAssignments((prev) => ({ ...prev, [slotId]: selectedPlayer }));
      setSelectedPlayer(null);
      setActiveSlotId(slotId);
      setChecked(false);
    } else {
      const current = assignments[slotId] ?? null;
      if (current) {
        setAssignments((prev) => ({ ...prev, [slotId]: null }));
        setSelectedPlayer(current);
        setChecked(false);
      }
      setActiveSlotId((prev) => (prev === slotId ? null : slotId));
    }
  };

  const handleCheck = () => {
    setChecked(true);
    setActiveSlotId(null);
  };

  const handleReset = () => {
    setAssignments({});
    setSelectedPlayer(null);
    setActiveSlotId(null);
    setChecked(false);
  };

  if (!data) return <div className="ptmg-loading">Loading match data…</div>;

  const playerByName = new Map(ROSTER.map((p) => [p.fullName, p]));

  const pitchSlots: PitchSlot[] = slots.map((s) => {
    const assignedName = assignments[s.id] ?? null;
    const assignedPlayer = assignedName ? playerByName.get(assignedName) : null;

    let state: PitchSlotState = "empty";
    if (checked) {
      state = assignedName === s.correctFullName ? "correct" : assignedName ? "wrong" : "empty";
    } else if (s.id === activeSlotId) {
      state = "active";
    } else if (assignedName) {
      state = "assigned";
    }

    return {
      id: s.id,
      x: s.x,
      y: s.y,
      label: assignedPlayer ? String(assignedPlayer.number) : "?",
      state,
    };
  });

  return (
    <div className="ptmg-root">
      <header className="ptmg-header">
        <h1 className="ptmg-title">Passing Triangle Matching Game</h1>
        <p className="ptmg-subtitle">
          Every pass Argentina completed in the 2022 World Cup Final traces a
          "pivot triangle" through the player who received it and passed it
          on. The 11 circles below sit at each starter's real average pivot
          location — a rough lineup shape. Click a circle to preview the
          passing pattern that belongs there, then pick a player from the
          roster and click the circle you think is theirs.
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
        {selectedPlayer ? (
          <p className="ptmg-hint">
            Selected: <strong>{playerByName.get(selectedPlayer)?.displayName}</strong> — click a circle on the pitch to place them.
          </p>
        ) : (
          <p className="ptmg-hint">Click an empty circle to preview its passing shape before you decide.</p>
        )}
      </section>

      <section className="ptmg-board">
        <div className="ptmg-pitch-wrap-single">
          <PitchChart
            triangles={activeTriangles}
            interactive={checked}
            slots={pitchSlots}
            onSlotClick={handleSlotClick}
          />
        </div>

        {checked && (
          <ul className="ptmg-results-list">
            {slots.map((s) => {
              const assignedName = assignments[s.id] ?? null;
              const assignedPlayer = assignedName ? playerByName.get(assignedName) : null;
              const correctPlayer = playerByName.get(s.correctFullName);
              const isCorrect = assignedName === s.correctFullName;
              return (
                <li key={s.id} className={isCorrect ? "correct" : "wrong"}>
                  {assignedPlayer?.displayName ?? "—"}
                  {isCorrect ? " ✓" : ` — actually ${correctPlayer?.displayName} ✗`}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="ptmg-actions">
        <button className="ptmg-btn primary" disabled={!allAssigned} onClick={handleCheck}>
          Check answers
        </button>
        <button className="ptmg-btn" onClick={handleReset}>
          Reset
        </button>
        {checked && (
          <span className="ptmg-score">
            Score: {score} / {slots.length}
          </span>
        )}
        {!allAssigned && (
          <span className="ptmg-hint-inline">
            Place all {slots.length} players to check your answers.
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
