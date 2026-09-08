import { useState } from "react";
import { GRID_ROWS, GRID_COLS, STATE_GRID_POS } from "./stateGridPositions";
import { seqBucketClass, SEQ_BUCKET_COUNT } from "./colorScales";
import Tooltip from "./Tooltip";
import type { StateRow, MailStatus } from "./types";

const MAIL_STATUS_LABEL: Record<MailStatus, string> = {
  "permanent-pre2016": "all-mail since before 2016",
  "permanent-post2020": "all-mail since ~2020",
  "covid-only": "all-mail in 2020 only, then reverted",
  never: "never all-mail",
};

interface Props {
  states: StateRow[];
  /** Gap value to encode per state (e.g. pooled or single-year under35Gap). */
  valueFor: (s: StateRow) => number | null;
  /** What valueFor represents, shown in the tooltip (e.g. "2016/2020/2024 pooled"). */
  valueLabel?: string;
  /** Shared domain [worst, best] so color stays comparable across any view
   * that reuses this component - e.g. don't let a single-cycle map and a
   * pooled map use different scales. Values are negative gaps; worst is
   * the most-negative (furthest from parity), best is closest to 0. */
  domain: [number, number];
  highlightMail?: boolean;
  legendCaption?: string;
}

export default function StateGrid({
  states,
  valueFor,
  valueLabel = "gap",
  domain,
  highlightMail,
  legendCaption,
}: Props) {
  const [worst, best] = domain; // worst is more negative than best
  const seqT = (v: number) => (v - worst) / (best - worst || 1);
  const [hover, setHover] = useState<{ state: StateRow; clientX: number; clientY: number } | null>(null);

  return (
    <div className="voa-grid-wrap">
      <div
        className="voa-grid"
        style={{
          gridTemplateColumns: `repeat(${GRID_COLS}, minmax(24px, 1fr))`,
          gridTemplateRows: `repeat(${GRID_ROWS}, minmax(24px, 1fr))`,
        }}
      >
        {states.map((s) => {
          const pos = STATE_GRID_POS[s.state];
          if (!pos) return null;
          const v = valueFor(s);
          const cls = v == null ? "" : seqBucketClass(seqT(v));
          const isMail = s.mailStatus !== "never";
          return (
            <div
              key={s.state}
              className={`voa-tile ${cls} ${highlightMail && isMail ? "voa-tile--mail" : ""}`}
              style={{ gridRow: pos.row + 1, gridColumn: pos.col + 1 }}
              onPointerEnter={(e) => setHover({ state: s, clientX: e.clientX, clientY: e.clientY })}
              onPointerMove={(e) => setHover({ state: s, clientX: e.clientX, clientY: e.clientY })}
              onPointerDown={(e) => setHover({ state: s, clientX: e.clientX, clientY: e.clientY })}
              onPointerLeave={(e) => {
                if (e.pointerType === "touch") return;
                setHover(null);
              }}
            >
              <span className="voa-tile-label">{s.abbr}</span>
            </div>
          );
        })}
      </div>
      <div className="voa-legend">
        <span>{worst.toFixed(1)}pp</span>
        {Array.from({ length: SEQ_BUCKET_COUNT }).map((_, i) => (
          <span key={i} className={`voa-legend-swatch ${seqBucketClass(i / (SEQ_BUCKET_COUNT - 1))}`} />
        ))}
        <span>{best.toFixed(1)}pp</span>
        {highlightMail && (
          <>
            <span style={{ marginLeft: "0.6rem" }} className="voa-legend-ring" />
            <span>all-mail state</span>
          </>
        )}
        {legendCaption && <span style={{ marginLeft: "0.4rem" }}>· {legendCaption}</span>}
      </div>
      {hover && (
        <Tooltip
          clientX={hover.clientX}
          clientY={hover.clientY}
          content={
            <>
              <div className="voa-tooltip__head">{hover.state.state}</div>
              <div>
                {valueLabel}: <strong>{valueFor(hover.state)?.toFixed(2) ?? "n/a"}pp</strong>
              </div>
              <div>{MAIL_STATUS_LABEL[hover.state.mailStatus]}</div>
            </>
          }
        />
      )}
    </div>
  );
}
