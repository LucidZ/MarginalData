import type { Preset } from "./presetList";

interface Props {
  presets: Preset[];
  active: string | null;
  onPick: (p: Preset) => void;
}

const Presets = ({ presets, active, onPick }: Props) => (
  <div className="i70x-presets" role="group" aria-label="Example comparisons">
    <span className="i70x-presets-label">Try:</span>
    {presets.map((p) => (
      <button
        key={p.id}
        type="button"
        className={`i70x-chip${p.id === active ? " active" : ""}`}
        aria-pressed={p.id === active}
        onClick={() => onPick(p)}
      >
        {p.label}
      </button>
    ))}
  </div>
);

export default Presets;
