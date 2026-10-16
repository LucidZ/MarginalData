import { useEffect, useRef, useState } from "react";
import type { Actor } from "./types";

interface Props {
  actor: Actor;
  totalFilms: number;
  totalCostars: number;
}

/** "Tom Hanks" -> "Tom Hanks'", "Samuel L. Jackson" -> "Samuel L. Jackson's".
 * Chicago would write "Hanks's"; the bare apostrophe is the form that reads
 * naturally out loud, which is what matters for a line someone posts. */
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** The line that goes *above* the link in a post - the one people actually
 * read. Deliberately not the same sentence as countsLine(): that one scopes
 * itself to the pool ("among the 2,839 actors tracked here") because it sits
 * beside the chart it describes, and a caption on someone else's timeline
 * has no chart to qualify. This states the hook and lets the page explain
 * itself. */
export function shareText(actor: Actor, totalFilms: number, totalCostars: number): string {
  const costars = `${totalCostars.toLocaleString()} costar${totalCostars === 1 ? "" : "s"}`;
  const films = `${totalFilms.toLocaleString()} film${totalFilms === 1 ? "" : "s"}`;
  return `Look at ${possessive(actor.name)} costars - ${costars} across ${films}.`;
}

/** Built from the root actor's own nconst rather than from window.location,
 * because the two disagree exactly when sharing matters most: a random
 * fallback root (no ?actor= at all) and a recenter that hasn't yet been
 * pushed to the URL would both otherwise share a link back to someone else's
 * chart. Dropping the rest of the query string is deliberate for the same
 * reason - nothing else on this page is worth carrying into someone else's
 * tab. */
export function shareUrl(actor: Actor): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?actor=${actor.nconst}`;
}

/** Best-effort copy for the (non-secure-context, older Safari) cases where
 * navigator.clipboard is undefined. execCommand is deprecated but still the
 * only fallback that works without a user-visible prompt. */
function legacyCopy(value: string): boolean {
  const el = document.createElement("textarea");
  el.value = value;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(el);
  return ok;
}

type Status = "idle" | "copied" | "failed";

export default function ShareButton({ actor, totalFilms, totalCostars }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<number | null>(null);

  // Any recenter makes the current confirmation stale - it refers to a link
  // for the previous actor.
  useEffect(() => {
    setStatus("idle");
  }, [actor.nconst]);

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );

  const flash = (next: Status) => {
    setStatus(next);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus("idle"), 2400);
  };

  const onClick = async () => {
    const text = shareText(actor, totalFilms, totalCostars);
    const url = shareUrl(actor);
    const payload = { title: "The Usual Suspects", text, url };

    // Native sheet where there is one (all of mobile, some of desktop); the
    // clipboard everywhere else. canShare is the reliable test - Chrome on
    // macOS defines navigator.share but rejects the call.
    if (typeof navigator.canShare === "function" && navigator.canShare(payload)) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        // Dismissing the sheet is a cancel, not a failure - falling through
        // to the clipboard there would copy a link the user just declined
        // to send.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    const clipboardValue = `${text} ${url}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(clipboardValue);
        flash("copied");
        return;
      }
    } catch {
      // Permission denied or a non-secure context - try the old way below.
    }
    flash(legacyCopy(clipboardValue) ? "copied" : "failed");
  };

  return (
    <button
      type="button"
      className="tus-share"
      data-status={status}
      onClick={onClick}
      aria-label={`Share ${possessive(actor.name)} costars`}
      title={`Share ${possessive(actor.name)} costars`}
    >
      <span aria-hidden="true">
        {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : "Share"}
      </span>
      {/* The visible label swaps in place, which a screen reader reading the
          button's own name would announce only if focus happened to be on
          it. This says it regardless. */}
      <span className="tus-visually-hidden" role="status">
        {status === "copied" ? "Link copied to clipboard" : status === "failed" ? "Could not copy the link" : ""}
      </span>
    </button>
  );
}
