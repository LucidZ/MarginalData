import type { Direction, Series } from "./types";
import { perDay, seriesColor } from "./compare";
import { fmtInt, hourLabel } from "./format";

interface Props {
  series: Series[];
  dir: Direction;
  hours: [number, number] | null;
  highlight: string | null;
  onHighlight: (key: string | null) => void;
}

/** Averages over fewer days than this are flagged as noisy. */
const FEW_DAYS = 10;

const pctText = (v: number, ref: number) => {
  const p = Math.round((v / ref - 1) * 100);
  return p === 0 ? "same" : `${p > 0 ? "+" : ""}${p}%`;
};

// Totals per series: average vehicles per day (over the brushed hours, if
// any) and the % difference from the reference line. Doubles as the legend.
const SeriesTable = ({ series, dir, hours, highlight, onHighlight }: Props) => {
  const ref = series.find((s) => s.style === "ref") ?? null;
  const others = series.filter((s) => s.style !== "ref");
  const refTotal = ref ? perDay(ref.curve, hours) : null;
  const span = hours ? `${hourLabel(hours[0])}-${hourLabel(hours[1] + 1)}` : null;
  const dirWord = dir === "wb" ? "westbound" : "eastbound";
  const lcFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

  // Two-line comparisons get a sentence.
  let headline: string | null = null;
  if (ref && refTotal && others.length === 1) {
    const t = perDay(others[0].curve, hours);
    const p = Math.round((t / refTotal - 1) * 100);
    const when = span ? `from ${span}` : "per day";
    const diff = p === 0 ? "about as many" : `${Math.abs(p)}% ${p < 0 ? "fewer" : "more"}`;
    headline =
      `${others[0].label}: ${diff} ${dirWord} vehicles ${when} ${p === 0 ? "as" : "than"} ${lcFirst(ref.label)}` +
      ` (${fmtInt(t)} vs ${fmtInt(refTotal)}).`;
  }

  return (
    <div className="i70x-series-table">
      {headline && <p className="i70x-headline">{headline}</p>}
      <div className={`i70x-table-wrap${series.length > 8 ? " tall" : ""}`}>
        <table className="i70x-table">
          <thead>
            <tr>
              <th></th>
              <th className="num">Days</th>
              <th className="num">Vehicles/day{span ? `, ${span}` : ""}</th>
              {ref && <th className="num">Diff.</th>}
            </tr>
          </thead>
          <tbody>
            {[...(ref ? [ref] : []), ...others].map((s) => {
              const t = perDay(s.curve, hours);
              const few = s.nDays < FEW_DAYS;
              return (
                <tr
                  key={s.key}
                  className={s.key === highlight ? "hl" : undefined}
                  onPointerEnter={() => s.style !== "ref" && onHighlight(s.key)}
                  onPointerLeave={() => onHighlight(null)}
                >
                  <td>
                    <i
                      className={`i70x-key${s.style === "ref" ? " ref" : ""}`}
                      style={{ background: s.style === "ref" ? undefined : seriesColor(s, dir) }}
                    />{" "}
                    {s.label}
                    {few && <span className="i70x-few"> few days, noisy</span>}
                  </td>
                  <td className="num">{fmtInt(s.nDays)}</td>
                  <td className="num">{fmtInt(t)}</td>
                  {ref && (
                    <td className="num">{s === ref ? <span className="i70x-few">reference</span> : refTotal ? pctText(t, refTotal) : "n/a"}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SeriesTable;
