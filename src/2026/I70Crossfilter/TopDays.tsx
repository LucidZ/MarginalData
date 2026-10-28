import type { Dataset, Direction } from "./types";
import { DOW_LABELS, holidayLabel, weekday } from "./bins";
import { dirLabel, dirWord, fmtDate, fmtInches, fmtInt } from "./format";

interface Props {
  data: Dataset;
  top: number[];
  dir: Direction;
}

// Busiest matching days in the current direction. Doubles as the table view.
const TopDays = ({ data, top, dir }: Props) => {
  const { days, dates } = data;
  return (
    <div className="i70x-card i70x-table-card">
      <div className="i70x-card-head">
        <h3>Busiest matching days ({dirWord(days.id, dir)})</h3>
      </div>
      {top.length === 0 ? (
        <p className="i70x-readout">No complete days match.</p>
      ) : (
        <div className="i70x-table-wrap">
          <table className="i70x-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th className="num">{dirLabel(days.id, "wb")}</th>
                <th className="num">{dirLabel(days.id, "eb")}</th>
                <th>Holiday</th>
                <th className="num">Snow overnight</th>
                <th className="num">Snow by day</th>
              </tr>
            </thead>
            <tbody>
              {top.map((i) => (
                <tr key={i}>
                  <td>{fmtDate(dates[i])}</td>
                  <td>{DOW_LABELS[weekday(dates[i])]}</td>
                  <td className={`num ${dir === "wb" ? "sorted" : ""}`}>{fmtInt(days.wbTotal[i] ?? 0)}</td>
                  <td className={`num ${dir === "eb" ? "sorted" : ""}`}>
                    {days.ebTotal[i] == null ? "n/a" : fmtInt(days.ebTotal[i]!)}
                  </td>
                  <td>{days.holiday[i] ? holidayLabel(days.holidays[days.holiday[i]]) : ""}</td>
                  <td className="num">{fmtInches(days.snowOvernight[i])}</td>
                  <td className="num">{fmtInches(days.snowDay[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TopDays;
