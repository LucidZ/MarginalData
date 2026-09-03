import { GRID_ROWS, GRID_COLS, STATE_GRID_POS } from "./stateGridPositions";
import { seqBucketClass, SEQ_BUCKET_COUNT } from "./colorScales";
import type { StateRow } from "./types";

interface Props {
  states: StateRow[];
  /** Gap value to encode per state (e.g. pooled or single-year under35Gap). */
  valueFor: (s: StateRow) => number | null;
  /** Shared domain [worst, best] so color stays comparable across any view
   * that reuses this component - e.g. don't let a single-cycle map and a
   * pooled map use different scales. Values are negative gaps; worst is
   * the most-negative (furthest from parity), best is closest to 0. */
  domain: [number, number];
  highlightMail?: boolean;
  legendCaption?: string;
}

export default function StateGrid({ states, valueFor, domain, highlightMail, legendCaption }: Props) {
  const [worst, best] = domain; // worst is more negative than best
  const seqT = (v: number) => (v - worst) / (best - worst || 1);

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
              title={`${s.state}: ${v != null ? v.toFixed(1) + "pp" : "n/a"}`}
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
    </div>
  );
}
