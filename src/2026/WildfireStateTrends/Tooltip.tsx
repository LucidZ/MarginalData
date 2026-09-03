import type { Metric, StateTrend } from "./types";

interface Props {
  state: StateTrend;
  yearIndex: number;
  metric: Metric;
  clientX: number;
  clientY: number;
}

export default function Tooltip({ state, yearIndex, metric, clientX, clientY }: Props) {
  const year = state.years[yearIndex];
  const observed = metric === "mean" ? state.totalPM[yearIndex] : state.totalExtremeDays[yearIndex];
  const counterfactual =
    metric === "mean" ? state.nonsmokePM[yearIndex] : state.nonsmokeExtremeDays[yearIndex];
  const isExtreme = metric === "extreme";
  const fmt = (v: number | null) =>
    v === null ? "—" : isExtreme ? `${v.toFixed(1)} days` : `${v.toFixed(1)} µg/m³`;

  const TOOLTIP_W = 210;
  const TOOLTIP_H = 96;
  const left = Math.max(8, Math.min(clientX + 14, window.innerWidth - TOOLTIP_W - 8));
  // A touch finger covers the point it's on — and a swipe near the bottom of
  // the screen leaves no room below — so prefer placing the tooltip above
  // the touch/cursor point once we're in the lower half of the viewport.
  const top =
    clientY + 14 + TOOLTIP_H > window.innerHeight
      ? Math.max(8, clientY - TOOLTIP_H - 14)
      : clientY + 14;

  return (
    <div className="wst-tooltip" style={{ left, top }}>
      <div className="wst-tooltip__head">
        {state.name} · {year}
      </div>
      <div>
        <span className="wst-tooltip__dot" style={{ background: "var(--text-primary)" }} />
        Observed: <strong>{fmt(observed)}</strong>
      </div>
      <div>
        <span className="wst-tooltip__dot" style={{ background: "var(--series-1)" }} />
        Without smoke: <strong>{fmt(counterfactual)}</strong>
      </div>
    </div>
  );
}
