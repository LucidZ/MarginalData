import type { Day } from "./types";
import { dateLabel } from "./format";

interface DayHeaderProps {
  day: Day;
}

export default function DayHeader({ day }: DayHeaderProps) {
  return (
    <div className="i70-day-header">
      <h3>
        {day.label} <span className="i70-day-date">{day.weekday} {dateLabel(day.date)}</span>
      </h3>
      <p className="i70-day-note">{day.note}</p>
    </div>
  );
}
