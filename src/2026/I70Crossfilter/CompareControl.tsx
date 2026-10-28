import type { Grouping } from "./compare";

interface Props {
  groupings: Grouping[];
  value: string | null;
  onChange: (id: string | null) => void;
}

// One control for splitting the matching days into lines; the filter
// charts only ever narrow the days down.
const CompareControl = ({ groupings, value, onChange }: Props) => {
  const dims = [...new Set(groupings.map((g) => g.dim))];
  return (
    <label className="i70x-compare">
      Compare by
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Nothing (matching days vs all days)</option>
        {dims.map((dim) => (
          <optgroup key={dim} label={dim}>
            {groupings
              .filter((g) => g.dim === dim)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {dim}: {g.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
};

export default CompareControl;
