import { useMemo, useState } from "react";
import { useData } from "../PassingCompass/useData";
import PitchChart from "../PassingCompass/PitchChart";
import type { PitchSlot, PitchSlotState } from "../PassingCompass/PitchChart";
import PlayerAvatar from "./PlayerAvatar";
import { ROSTER } from "./roster";
import { PHOTO_CREDITS } from "./photoCredits";
import type { GameSlot, Assignments } from "./types";
import "../PassingCompass/App.css";
import "./App.css";

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export default function App() {
  const data = useData();
  const [assignments, setAssignments] = useState<Assignments>({});
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [hasCheckedOnce, setHasCheckedOnce] = useState(false);
  // Slots confirmed correct on some past check — locked in for good, even
  // across retry rounds, so fixing mistakes can't clobber an answer already
  // earned.
  const [lockedSlots, setLockedSlots] = useState<Set<string>>(new Set());
  const [showTrueLineup, setShowTrueLineup] = useState(false);

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
  const score = lockedSlots.size;
  const isSolved = slots.length > 0 && lockedSlots.size === slots.length;

  const isLocked = (slotId: string) => lockedSlots.has(slotId);

  // Tapping a circle only previews its passing shape — it never changes an
  // existing guess, so re-checking your work doesn't cost you the answer.
  // Assignment happens separately, by tapping a player in the strip (which
  // overwrites any previous guess for the active circle); clearing one is a
  // separate explicit action (handleClearActive).
  const handleSlotClick = (slotId: string) => {
    setActiveSlotId(slotId);
  };

  const handleCardClick = (fullName: string) => {
    if (!activeSlotId || isLocked(activeSlotId)) return;
    setAssignments((prev) => ({ ...prev, [activeSlotId]: fullName }));
  };

  const handleClearActive = () => {
    if (!activeSlotId || isLocked(activeSlotId)) return;
    setAssignments((prev) => ({ ...prev, [activeSlotId]: null }));
  };

  const handleCheck = () => {
    setLockedSlots((prev) => {
      const next = new Set(prev);
      for (const s of slots) {
        if (assignments[s.id] === s.correctFullName) next.add(s.id);
      }
      return next;
    });
    setChecked(true);
    setHasCheckedOnce(true);
    setActiveSlotId(null);
  };

  // Every wrong slot's rightful player is, by construction, misplaced on
  // some other still-wrong slot (never on a locked one) — so releasing all
  // wrong slots at once always hands back exactly the players needed to
  // refill them, with no deadlock.
  const handleRetry = () => {
    setAssignments((prev) => {
      const next = { ...prev };
      for (const s of slots) {
        if (!lockedSlots.has(s.id)) next[s.id] = null;
      }
      return next;
    });
    setChecked(false);
    setActiveSlotId(null);
  };

  const handleReset = () => {
    setAssignments({});
    setActiveSlotId(null);
    setChecked(false);
    setHasCheckedOnce(false);
    setLockedSlots(new Set());
    setShowTrueLineup(false);
  };

  if (!data) return <div className="ptmg-loading">Loading match data…</div>;

  const playerByName = new Map(ROSTER.map((p) => [p.fullName, p]));
  const activeAssignedName = activeSlotId ? assignments[activeSlotId] : null;
  const activeAssignedPlayer = activeAssignedName ? playerByName.get(activeAssignedName) : null;

  const pitchSlots: PitchSlot[] = slots.map((s) => {
    const assignedName = assignments[s.id] ?? null;
    const assignedPlayer = assignedName ? playerByName.get(assignedName) : null;
    const locked = lockedSlots.has(s.id);

    let state: PitchSlotState;
    if (locked) {
      state = "correct";
    } else if (checked) {
      state = s.id === activeSlotId ? "active" : assignedName ? "wrong" : "empty";
    } else if (s.id === activeSlotId) {
      state = "active";
    } else if (assignedName) {
      state = "assigned";
    } else {
      state = "empty";
    }

    // Own guess by default; the toggle swaps every circle to the correct
    // player while reviewing, without touching the underlying assignment.
    const displayPlayer = checked && showTrueLineup ? playerByName.get(s.correctFullName) ?? null : assignedPlayer;

    return {
      id: s.id,
      x: s.x,
      y: s.y,
      label: displayPlayer ? String(displayPlayer.number) : "?",
      photo: displayPlayer?.photo,
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
          location — a rough lineup shape. Tap a circle to preview the
          passing pattern that belongs there, then tap the player you think
          it is from the strip at the bottom of the screen.
        </p>
      </header>

      <section className="ptmg-board">
        <p className="ptmg-hint" aria-live="polite">
          {!activeSlotId ? (
            "Tap a circle on the pitch to preview its passing shape."
          ) : isLocked(activeSlotId) ? (
            <>
              Correct — <strong>{activeAssignedPlayer?.displayName}</strong> pivots here.
            </>
          ) : activeAssignedPlayer ? (
            <>
              Guessed: <strong>{activeAssignedPlayer.displayName}</strong> — tap another player
              below to change it, or{" "}
              <button type="button" className="ptmg-clear-btn" onClick={handleClearActive}>
                clear
              </button>
              .
            </>
          ) : (
            "Now tap the player below you think belongs here."
          )}
        </p>
        <div className="ptmg-pitch-wrap-single">
          <PitchChart
            triangles={activeTriangles}
            interactive={checked}
            slots={pitchSlots}
            onSlotClick={handleSlotClick}
          />
        </div>

        {hasCheckedOnce && (
          <ul className="ptmg-results-list">
            {slots.map((s) => {
              const assignedName = assignments[s.id] ?? null;
              const assignedPlayer = assignedName ? playerByName.get(assignedName) : null;
              const correctPlayer = playerByName.get(s.correctFullName);
              const locked = lockedSlots.has(s.id);
              return (
                <li key={s.id} className={locked ? "correct" : "wrong"}>
                  {assignedPlayer?.displayName ?? "—"}
                  {locked ? " ✓" : checked ? ` — actually ${correctPlayer?.displayName} ✗` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="ptmg-actions">
        {!checked && (
          <button className="ptmg-btn primary" disabled={!allAssigned} onClick={handleCheck}>
            Check answers
          </button>
        )}
        <button className="ptmg-btn" onClick={handleReset}>
          Reset
        </button>
        {checked && !isSolved && (
          <button className="ptmg-btn" onClick={handleRetry}>
            Try the wrong ones again
          </button>
        )}
        {checked && (
          <button className="ptmg-btn" onClick={() => setShowTrueLineup((v) => !v)}>
            {showTrueLineup ? "Hide true lineup" : "Show true lineup"}
          </button>
        )}
        {hasCheckedOnce && (
          <span className="ptmg-score">
            Score: {score} / {slots.length}
          </span>
        )}
        {!checked && !allAssigned && (
          <span className="ptmg-hint-inline">
            Place all {slots.length} players to check your answers.
          </span>
        )}
      </div>

      <p className="ptmg-footnote">
        Data: <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noopener noreferrer">StatsBomb open data</a>,
        {" "}2022 World Cup Final, Argentina vs. France.
      </p>

      <details className="ptmg-credits">
        <summary>Photo credits</summary>
        <ul>
          {PHOTO_CREDITS.map((c) => {
            const player = playerByName.get(c.fullName);
            return (
              <li key={c.fullName}>
                {player?.displayName ?? c.fullName}: photo by{" "}
                <a href={c.photographerUrl} target="_blank" rel="noopener noreferrer">{c.photographer}</a>
                {" "}(<a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">source</a>), licensed{" "}
                <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">{c.license}</a>, via Wikimedia Commons.
              </li>
            );
          })}
        </ul>
      </details>

      <nav className="ptmg-strip" aria-label="Players to place">
        <div className="ptmg-strip-inner">
          {availablePlayers.length === 0 ? (
            <p className="ptmg-strip-empty">
              {checked ? "All players placed." : "All players placed — check your answers above."}
            </p>
          ) : (
            availablePlayers.map((p) => (
              <button
                key={p.fullName}
                className="ptmg-chip"
                disabled={!activeSlotId || isLocked(activeSlotId)}
                onClick={() => handleCardClick(p.fullName)}
              >
                <PlayerAvatar photo={p.photo} displayName={p.displayName} number={p.number} size={40} />
                <span className="ptmg-chip-name">{p.shortName}</span>
              </button>
            ))
          )}
        </div>
      </nav>
    </div>
  );
}
