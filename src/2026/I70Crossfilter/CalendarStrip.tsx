import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, Direction } from "./types";
import { MISSING } from "./types";
import { useContainerWidth } from "./useContainerWidth";
import { bisectRight } from "d3";
import { MONTH_LABELS } from "./bins";
import { fmtDate, fmtInt } from "./format";

interface Props {
  data: Dataset;
  matched: Uint8Array;
  dir: Direction;
}

const LEFT = 34;
const TOP = 14;
const DAYS_PER_ROW = 366;
const MONTH_START = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]; // leap-year columns

// One mark per day: rows are years, columns day of year (Feb 29 keeps its
// own column, so dates line up across years). Canvas, ~11k marks.
const CalendarStrip = ({ data, matched, dir }: Props) => {
  const [ref, width] = useContainerWidth<HTMLDivElement>(900);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const firstYear = data.dates[0].getUTCFullYear();
  const nYears = data.dates[data.n - 1].getUTCFullYear() - firstYear + 1;
  const rowH = width < 600 ? 5 : 6;
  const height = TOP + nYears * rowH + 2;
  const colW = (width - LEFT) / DAYS_PER_ROW;

  const hasData = useMemo(() => {
    const out = new Uint8Array(data.n);
    for (let r = 0; r < data.n * 24; r++) {
      if (data.wb[r] !== MISSING || data.eb[r] !== MISSING) out[(r / 24) | 0] = 1;
    }
    return out;
  }, [data]);

  const cellOf = (i: number) => {
    const d = data.dates[i];
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    return { row: y - firstYear, col: MONTH_START[m] + d.getUTCDate() - 1 };
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const css = getComputedStyle(c);
    const on = css.getPropertyValue(`--${dir}`).trim() || "#2a78d6";
    const off = css.getPropertyValue("--gridline").trim() || "#e1e0d9";
    const text = css.getPropertyValue("--muted").trim() || "#898781";

    for (let i = 0; i < data.n; i++) {
      const { row, col } = cellOf(i);
      if (!hasData[i]) continue;
      ctx.fillStyle = matched[i] ? on : off;
      ctx.fillRect(LEFT + col * colW, TOP + row * rowH, Math.max(colW, 1), rowH - 1);
    }
    ctx.fillStyle = text;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    for (let r = 0; r < nYears; r += 5) {
      ctx.fillText(String(firstYear + r), LEFT - 4, TOP + r * rowH + rowH / 2);
    }
    ctx.textAlign = "left";
    MONTH_LABELS.forEach((m, k) => {
      if (width < 600 && k % 3) return;
      ctx.fillText(m, LEFT + MONTH_START[k] * colW, 6);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, hasData, matched, dir, width, height, colW, rowH, nYears, firstYear]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left - LEFT) / colW);
    const row = Math.floor((e.clientY - rect.top - TOP) / rowH);
    if (col < 0 || row < 0 || row >= nYears || col >= DAYS_PER_ROW) return setHover(null);
    const year = firstYear + row;
    const m = bisectRight(MONTH_START, col) - 1;
    const day = col - MONTH_START[m] + 1;
    const t = Date.UTC(year, m, day);
    const i = Math.round((t - data.dates[0].getTime()) / 86400000);
    const real = new Date(t).getUTCMonth() === m;
    setHover(real && i >= 0 && i < data.n ? i : null);
  };

  const h = hover;
  const total = h == null ? null : dir === "wb" ? data.days.wbTotal[h] : data.days.ebTotal[h];
  return (
    <div className="i70x-card i70x-calendar" ref={ref}>
      <div className="i70x-card-head">
        <h3>Every day, 1996-{data.days.partialYear}</h3>
      </div>
      <div className="i70x-readout">
        {h == null
          ? "Colored days match every filter. Grey days don't; blank means no data."
          : `${fmtDate(data.dates[h])}: ${total == null ? "incomplete" : `${fmtInt(total)} vehicles`}` +
            (matched[h] ? " (matches)" : "")}
      </div>
      <canvas
        ref={canvas}
        style={{ width, height, display: "block" }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Calendar of every day since 1996, matching days highlighted"
      />
    </div>
  );
};

export default CalendarStrip;
