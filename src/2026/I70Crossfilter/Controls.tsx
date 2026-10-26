import type { Direction } from "./types";

interface Props {
  dir: Direction;
  onDir: (d: Direction) => void;
  includeClosures: boolean;
  onClosures: (v: boolean) => void;
  includeIncomplete: boolean;
  onIncomplete: (v: boolean) => void;
  anyFilter: boolean;
  onReset: () => void;
}

const Controls = ({ dir, onDir, includeClosures, onClosures, includeIncomplete, onIncomplete, anyFilter, onReset }: Props) => (
  <div className="i70x-controls">
    <div className="i70x-seg" role="group" aria-label="Direction">
      {(["wb", "eb"] as const).map((d) => (
        <button key={d} type="button" className={dir === d ? `active ${d}` : ""} onClick={() => onDir(d)}>
          <i className={`i70x-key ${d}`} />
          {d === "wb" ? "Westbound" : "Eastbound"}
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
