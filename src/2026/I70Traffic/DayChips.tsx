import type { Day } from "./types";

interface DayChipsProps {
  days: Day[];
  selected: string[];
  toggle: (date: string) => void;
}

export default function DayChips({ days, selected, toggle }: DayChipsProps) {
  return (
    <div className="i70-chips" role="group" aria-label="Days to compare">
      {days.map((d) => {
        const on = selected.includes(d.date);
        return (
          <button key={d.date} type="button" aria-pressed={on} className={`i70-chip${on ? " is-on" : ""}`}
            onClick={() => toggle(d.date)}>
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
