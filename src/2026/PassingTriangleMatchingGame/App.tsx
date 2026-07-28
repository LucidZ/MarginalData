import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../PassingCompass/useData";
import PitchChart, { trapezoid, convexHull } from "../PassingCompass/PitchChart";
import type { PitchSlot, PitchSlotState, Pt } from "../PassingCompass/PitchChart";
import PlayerAvatar from "./PlayerAvatar";
import { ROSTER, type GamePlayer } from "./roster";
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

// Pointer movement (px) before a press-and-hold on a chip/avatar counts as a
// drag rather than a tap — keeps the existing tap-to-preview/tap-to-assign
// fallback working for anyone who isn't trying to drag.
const DRAG_PROMOTE_PX = 6;
// How far above the pointer the ghost avatar floats while dragging. Touch
// gets the big lift so the finger doesn't sit on top of the circle it's
// aiming at; mouse still gets a small one — otherwise the ghost (56px) is
// wider than the drop-target ring drawn under it (~52px), so hovering a
// slot dead-on would hide the very ring meant to confirm the hover.
const DRAG_LIFT_PX = 56;
const DRAG_LIFT_PX_MOUSE = 28;

/** What's being picked up: an unplaced player from the strip, or an already-placed one lifted straight off its pitch circle. */
type DragSource =
  | { kind: "chip"; fullName: string }
  | { kind: "slot"; slotId: string };

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
  // Static (depends only on ROSTER, not on `data`), so it's safe to compute
  // ahead of the loading-gate return below — handleSlotPointerDown needs it.
  const playerByName = new Map(ROSTER.map((p) => [p.fullName, p]));
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

  // Drag-to-assign: an alternative to tap-to-select-then-tap-to-assign, not a
  // replacement — the tap flow above is untouched and stays the accessible
  // fallback. `activeDrag` is only set once pointer movement crosses
  // DRAG_PROMOTE_PX (see handleDragPointerMove), so a plain tap never touches
  // this state and falls through to the existing click handlers.
  const [activeDrag, setActiveDrag] = useState<{ source: DragSource; player: GamePlayer; startX: number; startY: number; pointerType: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; blocked: boolean } | null>(null);
  // True while a lifted-off-the-pitch avatar hovers the bottom strip — the
  // gesture for unassigning it (drag it back to the bench).
  const [overStrip, setOverStrip] = useState(false);
  const ghostRef = useRef<HTMLDivElement>(null);
  // Pending press that hasn't (yet) moved past DRAG_PROMOTE_PX. Lives in a
  // ref, not state, since it churns on every pointermove and none of that
  // should trigger a render until/unless it's actually promoted to a drag.
  const dragCandidateRef = useRef<{
    source: DragSource;
    player: GamePlayer;
    pointerId: number;
    startX: number;
    startY: number;
    pointerType: string;
    promoted: boolean;
  } | null>(null);
  // On-screen circle centers/radii for every slot, snapshotted once when a
  // drag is promoted (they don't move mid-drag) so hit-testing during the
  // drag is just arithmetic, not a DOM query per pointermove.
  const slotTargetsRef = useRef<{ id: string; cx: number; cy: number; r: number }[]>([]);
  // Guards against the synthetic `click` a browser can still fire on the
  // press-origin element after a real drag+drop (pointer capture keeps
  // down/up "targeted" at that element even though the release happened
  // somewhere else) — without this a completed drop could be immediately
  // clobbered by the old tap-to-assign logic firing on its own element.
  const suppressClickRef = useRef(false);

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
    // A completed drag ending its release on this same circle can still
    // trigger a synthetic click afterward (see suppressClickRef) — swallow
    // exactly that one click so it doesn't re-open the slot as "active"
    // right after a swap already resolved it.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setActiveSlotId(slotId);
  };

  const handleCardClick = (fullName: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!activeSlotId || isLocked(activeSlotId)) return;
    setAssignments((prev) => ({ ...prev, [activeSlotId]: fullName }));
  };

  const handleClearActive = () => {
    if (!activeSlotId || isLocked(activeSlotId)) return;
    setAssignments((prev) => ({ ...prev, [activeSlotId]: null }));
  };

  // --- Drag-to-assign -------------------------------------------------
  // Two press origins feed the same pipeline: an unplaced chip in the strip,
  // or an already-placed avatar picked straight up off its pitch circle.
  // Both start here on pointerdown; handleDragPointerMove promotes the press
  // to an actual drag once it clears DRAG_PROMOTE_PX, so short presses fall
  // through to the ordinary click handlers above untouched.
  const beginDragCandidate = (source: DragSource, player: GamePlayer, e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragCandidateRef.current = {
      source,
      player,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      pointerType: e.pointerType,
      promoted: false,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const handleChipPointerDown = (player: GamePlayer, e: React.PointerEvent<HTMLButtonElement>) => {
    beginDragCandidate({ kind: "chip", fullName: player.fullName }, player, e);
  };

  const handleSlotPointerDown = (slotId: string, e: React.PointerEvent<SVGGElement>) => {
    if (isLocked(slotId)) return;
    const name = assignments[slotId];
    if (!name) return;
    const player = playerByName.get(name);
    if (!player) return;
    beginDragCandidate({ kind: "slot", slotId }, player, e);
  };

  const positionGhost = (x: number, y: number, pointerType: string) => {
    const el = ghostRef.current;
    if (!el) return;
    const lift = pointerType === "mouse" ? -DRAG_LIFT_PX_MOUSE : -DRAG_LIFT_PX;
    el.style.transform = `translate(${x}px, ${y + lift}px) translate(-50%, -50%)`;
  };

  const findSlotUnder = (x: number, y: number): string | null => {
    let best: { id: string; dist: number } | null = null;
    for (const t of slotTargetsRef.current) {
      const dist = Math.hypot(x - t.cx, y - t.cy);
      if (dist <= t.r * 1.4 && (!best || dist < best.dist)) best = { id: t.id, dist };
    }
    return best?.id ?? null;
  };

  const isOverStripRect = (x: number, y: number) => {
    const rect = stripNavRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const handleDragPointerMove = (e: PointerEvent) => {
    const cand = dragCandidateRef.current;
    if (!cand || cand.pointerId !== e.pointerId) return;

    if (!cand.promoted) {
      if (Math.hypot(e.clientX - cand.startX, e.clientY - cand.startY) < DRAG_PROMOTE_PX) return;
      cand.promoted = true;
      suppressClickRef.current = true;
      // Snapshot slot circle positions once per drag rather than per frame —
      // the pitch doesn't move mid-drag, so this is safe and much cheaper.
      slotTargetsRef.current = Array.from(document.querySelectorAll<SVGGElement>("[data-slot-id]"))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { id: el.getAttribute("data-slot-id")!, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, r: Math.max(rect.width, rect.height) / 2 };
        })
        // Dragging an already-placed avatar shouldn't "hover" its own circle.
        .filter((t) => !(cand.source.kind === "slot" && t.id === cand.source.slotId));
      setActiveDrag({ source: cand.source, player: cand.player, startX: e.clientX, startY: e.clientY, pointerType: cand.pointerType });
    }

    e.preventDefault();
    positionGhost(e.clientX, e.clientY, cand.pointerType);

    const hoverId = findSlotUnder(e.clientX, e.clientY);
    const overStripNow = cand.source.kind === "slot" && !hoverId && isOverStripRect(e.clientX, e.clientY);
    setOverStrip(overStripNow);
    setDropTarget((prev) => {
      if (!hoverId) return prev === null ? prev : null;
      const blocked = isLocked(hoverId);
      if (prev?.id === hoverId && prev?.blocked === blocked) return prev;
      return { id: hoverId, blocked };
    });
  };

  const applyDrop = (
    source: DragSource,
    player: GamePlayer,
    target: { id: string; blocked: boolean } | null,
    droppedOnStrip: boolean
  ) => {
    if (source.kind === "chip") {
      if (!target || target.blocked) return;
      setAssignments((prev) => ({ ...prev, [target.id]: player.fullName }));
      setActiveSlotId(target.id);
      return;
    }
    const fromId = source.slotId;
    if (isLocked(fromId)) return;
    if (droppedOnStrip) {
      setAssignments((prev) => ({ ...prev, [fromId]: null }));
      return;
    }
    if (!target || target.blocked) return;
    setAssignments((prev) => ({
      ...prev,
      [fromId]: prev[target.id] ?? null,
      [target.id]: prev[fromId] ?? null,
    }));
    setActiveSlotId(target.id);
  };

  const endDrag = (e: PointerEvent, drop: boolean) => {
    const cand = dragCandidateRef.current;
    if (!cand || cand.pointerId !== e.pointerId) return;
    dragCandidateRef.current = null;
    if (cand.promoted && drop) {
      applyDrop(cand.source, cand.player, dropTarget, overStrip);
    }
    setActiveDrag(null);
    setDropTarget(null);
    setOverStrip(false);
  };

  const handleDragPointerUp = (e: PointerEvent) => endDrag(e, true);
  const handleDragPointerCancel = (e: PointerEvent) => endDrag(e, false);

  // Keeps the window-level listeners below stable across renders (attached
  // once, on mount) while still calling into each render's fresh closures —
  // otherwise they'd see stale `lockedSlots`/`dropTarget`/etc. forever.
  const dragHandlersRef = useRef({ move: handleDragPointerMove, up: handleDragPointerUp, cancel: handleDragPointerCancel });
  dragHandlersRef.current = { move: handleDragPointerMove, up: handleDragPointerUp, cancel: handleDragPointerCancel };

  useEffect(() => {
    const onMove = (e: PointerEvent) => dragHandlersRef.current.move(e);
    const onUp = (e: PointerEvent) => dragHandlersRef.current.up(e);
    const onCancel = (e: PointerEvent) => dragHandlersRef.current.cancel(e);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, []);

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

    // The real avatar is riding the floating ghost right now — leave a
    // visibly empty circle behind it instead of showing it in two places.
    const isBeingDragged = activeDrag?.source.kind === "slot" && activeDrag.source.slotId === s.id;

    return {
      id: s.id,
      x: s.x,
      y: s.y,
      label: isBeingDragged ? "?" : displayPlayer ? String(displayPlayer.number) : "?",
      photo: isBeingDragged ? undefined : displayPlayer?.photo,
      state: isBeingDragged ? "empty" : state,
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
            onSlotPointerDown={handleSlotPointerDown}
            dropTarget={dropTarget}
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
          (!stripScroll.atEnd ? " can-scroll-right" : "") +
          (overStrip ? " drop-armed" : "")
        }
        aria-label="Players to place"
        ref={stripNavRef}
      >
        <p className="ptmg-strip-hint" aria-live="polite">
          {overStrip ? (
            "Let go to send this player back to the bench."
          ) : !activeSlotId ? (
            "Tap a circle to preview its passing shape, or drag a player onto one to place them."
          ) : isLocked(activeSlotId) ? (
            <>
              Correct — this is <strong>{activeAssignedPlayer?.displayName}</strong>'s passing triangle.
            </>
          ) : activeAssignedPlayer ? (
            <>
              Guessed: <strong>{activeAssignedPlayer.displayName}</strong> — tap or drag another
              player below to change it, or tap the <strong>?</strong> to clear it.
            </>
          ) : (
            "Now tap, or drag, the player you think belongs here."
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
                className={"ptmg-chip" + (!activeSlotId || isLocked(activeSlotId) ? " tap-inactive" : "")}
                aria-disabled={!activeSlotId || isLocked(activeSlotId)}
                onClick={() => handleCardClick(p.fullName)}
                onPointerDown={(e) => handleChipPointerDown(p, e)}
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

      {activeDrag && (
        <div
          className="ptmg-drag-ghost"
          ref={ghostRef}
          aria-hidden="true"
          style={{
            transform: `translate(${activeDrag.startX}px, ${
              activeDrag.startY - (activeDrag.pointerType === "mouse" ? DRAG_LIFT_PX_MOUSE : DRAG_LIFT_PX)
            }px) translate(-50%, -50%)`,
          }}
        >
          <PlayerAvatar
            photo={activeDrag.player.photo}
            displayName={activeDrag.player.displayName}
            number={activeDrag.player.number}
            size={56}
          />
        </div>
      )}
    </div>
  );
}
