import type { CounterId, Direction } from "./types";
import { dirLabel } from "./format";

interface Props {
  counters: { id: CounterId; name: string }[];
  counter: CounterId;
  onCounter: (c: CounterId) => void;
  dir: Direction;
  onDir: (d: Direction) => void;
  includeClosures: boolean;
  onClosures: (v: boolean) => void;
  includeIncomplete: boolean;
  onIncomplete: (v: boolean) => void;
  anyFilter: boolean;
  onReset: () => void;
}

const Controls = ({
  counters,
  counter,
  onCounter,
  dir,
  onDir,
  includeClosures,
  onClosures,
  includeIncomplete,
  onIncomplete,
  anyFilter,
  onReset,
}: Props) => (
  <div className="i70x-controls">
    <div className="i70x-seg" role="group" aria-label="Counter">
      {counters.map((c) => (
        <button key={c.id} type="button" className={counter === c.id ? "active" : ""} onClick={() => onCounter(c.id)}>
          {c.name}
        </button>
      ))}
    </div>
    <div className="i70x-seg" role="group" aria-label="Direction">
      {(["wb", "eb"] as const).map((d) => (
        <button key={d} type="button" className={dir === d ? `active ${d}` : ""} onClick={() => onDir(d)}>
          <i className={`i70x-key ${d}`} />
          {dirLabel(counter, d)}
        </button>
      ))}
    </div>
    <label className="i70x-check">
      <input type="checkbox" checked={includeClosures} onChange={(e) => onClosures(e.target.checked)} />
      Include likely closures
    </label>
    <label className="i70x-check">
      <input type="checkbox" checked={includeIncomplete} onChange={(e) => onIncomplete(e.target.checked)} />
      Include days with missing hours
    </label>
    {anyFilter && (
      <button type="button" className="i70x-clear" onClick={onReset}>
        Reset all filters
      </button>
    )}
  </div>
);

export default Controls;
