import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../PassingCompass/useData";
import PitchChart, { trapezoid, convexHull } from "../PassingCompass/PitchChart";
import type { PitchSlot, PitchSlotState, Pt } from "../PassingCompass/PitchChart";
import PlayerAvatar from "./PlayerAvatar";
import { ROSTER } from "./roster";
import { PHOTO_CREDITS } from "./photoCredits";
import type { GameSlot, Assignments } from "./types";
import "../PassingCompass/App.css";
import "./App.css";

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// How far the strip auto-peeks to hint it scrolls (roughly one chip + gap).
const STRIP_PEEK_PX = 96;

// One real triangle from the dataset (not invented): extra time, minute 98,
// Fernández finds Messi, who carries it a few yards before slipping in
// Álvarez. Drawn with exactly the marks PitchChart draws in `legs="out"`
// mode (what the board below actually uses) — coverage hull, dashed carry,
// tapered pass-out, one small pivot dot, and the pass-in left faint inside
// the hull only — so this schematic isn't lying about what's below it.
const DEMO_PASS_START: Pt = { x: 30, y: 88 };
const DEMO_RECEIVE: Pt = { x: 118, y: 30 };
const DEMO_PIVOT: Pt = { x: 138, y: 22 };
const DEMO_PASS_END: Pt = { x: 222, y: 78 };

// Same taper width and the same n=1 opacity formula PitchChart uses (see its
// `fillOpacity` comment) — this is what a single real triangle looks like.
const DEMO_WIDE_W = 4.2;
const DEMO_NARROW_W = 0;
const DEMO_MARK_OPACITY = 0.3;
const DEMO_COVERAGE_OPACITY = DEMO_MARK_OPACITY * 0.35;
const DEMO_CARRY_OPACITY = DEMO_MARK_OPACITY * 2;

const DEMO_HULL = convexHull([DEMO_PASS_START, DEMO_RECEIVE, DEMO_PIVOT, DEMO_PASS_END]);

function DemoTriangle() {
  return (
    <div className="ptmg-demo">
      <svg viewBox="0 0 260 110" className="ptmg-demo-svg" role="img" aria-label="Diagram of a real passing triangle: Enzo Fernández finds Lionel Messi, who carries the ball before playing in Julián Álvarez">
        <polygon points={DEMO_HULL.map((p) => `${p.x},${p.y}`).join(" ")} fill="var(--status-good)" fillOpacity={DEMO_COVERAGE_OPACITY} stroke="none" />
        <line
          x1={DEMO_RECEIVE.x}
          y1={DEMO_RECEIVE.y}
          x2={DEMO_PIVOT.x}
          y2={DEMO_PIVOT.y}
          stroke="var(--status-good)"
          strokeOpacity={DEMO_CARRY_OPACITY}
          strokeWidth={1}
          strokeDasharray="3 2.5"
        />
        <polygon points={trapezoid(DEMO_PIVOT, DEMO_PASS_END, DEMO_NARROW_W, DEMO_WIDE_W)} fill="var(--status-good)" fillOpacity={DEMO_MARK_OPACITY} />
        <circle cx={DEMO_PIVOT.x} cy={DEMO_PIVOT.y} r={1.6} fill="var(--status-good)" fillOpacity={0.55} />

        <text x={58} y={46} textAnchor="middle" fontSize="8" fill="var(--text-secondary)">pass</text>
        <text x={130} y={42} textAnchor="middle" fontSize="8" fill="var(--text-secondary)">carry</text>
        <text x={192} y={38} textAnchor="middle" fontSize="8" fill="var(--text-secondary)">pass</text>

        <text x={DEMO_PASS_START.x} y={DEMO_PASS_START.y + 16} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">Fernández</text>
        <text x={DEMO_PIVOT.x} y={DEMO_PIVOT.y - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text-primary)">Messi</text>
        <text x={DEMO_PASS_END.x} y={DEMO_PASS_END.y + 16} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">Álvarez</text>
      </svg>
      <p className="ptmg-demo-caption">
        That's one real <strong>passing triangle</strong> with Messi as the pivot point.
        Each circle below represents the average position of a different starting player
        for Argentina in the 2022 World Cup final. 
      </p>
      <p className="ptmg-demo-caption"> Tap a circle to see every passing triangle that player
        was the pivot for. Incomplete passes show in red.
      </p>
    </div>
  );
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
  // Cumulative correct-count recorded after each "Check answers" click, so
  // progress across retry rounds is visible (e.g. 5/11, then 7/11, then 11/11).
  const [attemptHistory, setAttemptHistory] = useState<number[]>([]);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "shared">("idle");
  // Wrong slots stay unrevealed across retries until the player explicitly
  // gives up — checking your work shouldn't spoil the answer for free.
  const [gaveUp, setGaveUp] = useState(false);
  // Edge fades on the player strip hint that it scrolls sideways — recomputed
  // on scroll/resize and whenever the chip count changes (placing a player
  // shrinks the strip and can turn off the right-edge fade).
  const stripInnerRef = useRef<HTMLDivElement>(null);
  const stripNavRef = useRef<HTMLElement>(null);
  const [stripScroll, setStripScroll] = useState({ atStart: true, atEnd: true });
  // True once the player has ever touched/wheeled the strip themselves —
  // gates the auto-peek teaching animation below so it never fights a real
  // scroll gesture and stops nagging once it's done its job.
  const [stripInteracted, setStripInteracted] = useState(false);

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

  useEffect(() => {
    const el = stripInnerRef.current;
    if (!el) return;
    const update = () => {
      setStripScroll({
        atStart: el.scrollLeft <= 1,
        atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // `data` is included so this re-attaches once the loading gate lifts and
    // the strip's DOM (and stripInnerRef) actually exists.
  }, [availablePlayers.length, data]);

  // Nudges the strip sideways and back on a loop so the motion itself — not
  // just a static arrow — demonstrates that it scrolls. A real touch/wheel
  // on the strip cancels this for good; it isn't re-armed on Reset since the
  // player has already learned the mechanic by then.
  useEffect(() => {
    if (stripInteracted) return;
    const el = stripInnerRef.current;
    if (!el || availablePlayers.length === 0) return;

    const markInteracted = () => setStripInteracted(true);
    el.addEventListener("pointerdown", markInteracted, { once: true });
    el.addEventListener("wheel", markInteracted, { once: true, passive: true });

    let returnTimeout: number | undefined;
    const peek = () => {
      if (el.scrollWidth <= el.clientWidth) return;
      el.scrollTo({ left: STRIP_PEEK_PX, behavior: "smooth" });
      returnTimeout = window.setTimeout(() => {
        el.scrollTo({ left: 0, behavior: "smooth" });
      }, 550);
    };
    const firstPeek = window.setTimeout(peek, 1000);
    const interval = window.setInterval(peek, 3400);

    return () => {
      el.removeEventListener("pointerdown", markInteracted);
      el.removeEventListener("wheel", markInteracted);
      window.clearTimeout(firstPeek);
      window.clearTimeout(returnTimeout);
      window.clearInterval(interval);
    };
  }, [stripInteracted, availablePlayers.length, data]);

  // The strip only appears once a slot is active (see stripVisible below),
  // so this is the pixel test for whether it's on screen at all.
  const stripVisible = activeSlotId !== null;

  // The strip is fixed to the viewport bottom, so .ptmg-root needs matching
  // bottom padding to keep the footnote from hiding under it — measured
  // live since the strip's own content (hint text wrapping, chip count)
  // changes its height. While the strip is hidden (off-screen) no padding
  // is needed to clear it.
  useEffect(() => {
    if (!stripVisible) {
      document.documentElement.style.setProperty("--strip-height", "0px");
      return;
    }
    const nav = stripNavRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty("--strip-height", `${entry.contentRect.height}px`);
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, [data, stripVisible]);

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
    const nextLocked = new Set(lockedSlots);
    for (const s of slots) {
      if (assignments[s.id] === s.correctFullName) nextLocked.add(s.id);
    }
    setLockedSlots(nextLocked);
    setAttemptHistory((prev) => [...prev, nextLocked.size]);
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
    setShareStatus("idle");
  };

  const handleGiveUp = () => {
    setGaveUp(true);
    setChecked(true);
    setHasCheckedOnce(true);
    setActiveSlotId(null);
  };

  const handleReset = () => {
    setAssignments({});
    setActiveSlotId(null);
    setChecked(false);
    setHasCheckedOnce(false);
    setLockedSlots(new Set());
    setAttemptHistory([]);
    setShareStatus("idle");
    setGaveUp(false);
  };

  const handleShare = async () => {
    const triesLine = attemptHistory.length > 1
      ? ` in ${attemptHistory.length} tries (${attemptHistory.join(" → ")})`
      : "";
    const text = `I scored ${score}/${slots.length} on the Passing Triangle Matching Game${triesLine} — can you place Argentina's 2022 World Cup Final lineup?`;
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        setShareStatus("shared");
        setTimeout(() => setShareStatus("idle"), 2000);
      } catch {
        // User cancelled the native share sheet — not an error worth surfacing.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
    } catch {
      setShareStatus("idle");
    }
  };

  if (!data) return <div className="ptmg-loading">Loading match data…</div>;

  const playerByName = new Map(ROSTER.map((p) => [p.fullName, p]));
  const activeAssignedName = activeSlotId ? assignments[activeSlotId] : null;
  const activeAssignedPlayer = activeAssignedName ? playerByName.get(activeAssignedName) : null;

  const pitchSlots: PitchSlot[] = slots.map((s) => {
    const assignedName = assignments[s.id] ?? null;
    const assignedPlayer = assignedName ? playerByName.get(assignedName) : null;
    const locked = lockedSlots.has(s.id);
    // After giving up, unlocked circles show who actually belongs there
    // instead of the player's wrong guess.
    const revealed = gaveUp && !locked;
    const displayPlayer = revealed ? playerByName.get(s.correctFullName) : assignedPlayer;

    let state: PitchSlotState;
    if (locked) {
      state = "correct";
    } else if (revealed) {
      state = s.id === activeSlotId ? "active" : "revealed";
    } else if (checked) {
      state = s.id === activeSlotId ? "active" : assignedName ? "wrong" : "empty";
    } else if (s.id === activeSlotId) {
      state = "active";
    } else if (assignedName) {
      state = "assigned";
    } else {
      state = "empty";
    }

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
          <span className="ptmg-quote">
            "You should always have triangles, only then you have passing
            options." <span className="ptmg-quote-attr">— Johan Cruyff.</span>
          </span>{" "}
        </p>
      </header>

      <DemoTriangle />

      <section className="ptmg-board">
        <div className="ptmg-pitch-wrap-single">
          <PitchChart
            triangles={activeTriangles}
            interactive={checked}
            slots={pitchSlots}
            onSlotClick={handleSlotClick}
            legs="out"
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
                  {locked
                    ? " ✓"
                    : checked
                      ? gaveUp
                        ? ` — actually ${correctPlayer?.displayName} ✗`
                        : " ✗"
                      : ""}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="ptmg-content">
        <div className="ptmg-actions">
          {!checked && (
            <button className="ptmg-btn primary" disabled={!allAssigned} onClick={handleCheck}>
              Check answers
            </button>
          )}
          <button className="ptmg-btn" onClick={handleReset}>
            Reset
          </button>
          {checked && !isSolved && !gaveUp && (
            <button className="ptmg-btn" onClick={handleRetry}>
              Try the wrong ones again
            </button>
          )}
          {checked && !isSolved && !gaveUp && (
            <button className="ptmg-btn" onClick={handleGiveUp}>
              I give up, show me
            </button>
          )}
          {hasCheckedOnce && (
            <span className="ptmg-score">
              Score: {score} / {slots.length}
            </span>
          )}
          {hasCheckedOnce && (
            <button className="ptmg-btn" onClick={handleShare}>
              {shareStatus === "copied" ? "Copied!" : shareStatus === "shared" ? "Shared!" : "Share results"}
            </button>
          )}
          {!checked && !allAssigned && (
            <span className="ptmg-hint-inline">
              Place all {slots.length} players to check your answers.
            </span>
          )}
        </div>

        {attemptHistory.length > 0 && (
          <ol className="ptmg-history">
            {attemptHistory.map((s, i) => (
              <li key={i} className={s === slots.length ? "solved" : undefined}>
                {ordinal(i + 1)} try: {s}/{slots.length}
              </li>
            ))}
          </ol>
        )}

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
      </div>

      <nav
        className={
          "ptmg-strip" +
          (stripVisible ? " visible" : "") +
          (!stripScroll.atStart ? " can-scroll-left" : "") +
          (!stripScroll.atEnd ? " can-scroll-right" : "")
        }
        aria-label="Players to place"
        ref={stripNavRef}
      >
        <p className="ptmg-strip-hint" aria-live="polite">
          {!activeSlotId ? (
            "Tap a circle on the pitch to preview its passing shape."
          ) : isLocked(activeSlotId) ? (
            <>
              Correct — this is <strong>{activeAssignedPlayer?.displayName}</strong>'s passing triangle.
            </>
          ) : activeAssignedPlayer ? (
            <>
              Guessed: <strong>{activeAssignedPlayer.displayName}</strong> — tap another player
              below to change it, or tap the <strong>?</strong> to clear it.
            </>
          ) : (
            "Now tap the player you think belongs here."
          )}
        </p>
        <div className="ptmg-strip-inner" ref={stripInnerRef}>
          <button
            className="ptmg-chip ptmg-chip-clear"
            disabled={!activeSlotId || isLocked(activeSlotId)}
            onClick={handleClearActive}
          >
            <span className="ptmg-avatar ptmg-avatar-clear" style={{ width: 40, height: 40 }}>?</span>
            <span className="ptmg-chip-name">Clear</span>
          </button>
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
        <div className="ptmg-strip-fade left" aria-hidden="true" />
        <div className="ptmg-strip-fade right" aria-hidden="true" />
      </nav>
    </div>
  );
}
