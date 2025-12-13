import { ComparisonRow } from "./App";

interface ComparisonTableProps {
  optionAName: string;
  optionBName: string;
  setOptionAName: (name: string) => void;
  setOptionBName: (name: string) => void;
  rows: ComparisonRow[];
  addRow: () => void;
  deleteRow: (id: string) => void;
  updateRow: (id: string, updates: Partial<ComparisonRow>) => void;
  activeRowId: string | null;
  setActiveRowId: (id: string | null) => void;
}

export default function ComparisonTable({
  optionAName,
  optionBName,
  setOptionAName,
  setOptionBName,
  rows,
  addRow,
  deleteRow,
  updateRow,
  activeRowId,
  setActiveRowId,
}: ComparisonTableProps) {
  return (
    <div className="comparison-table">
      <h2>Step 1: Compare Your Options</h2>

      <div className="table-headers">
        <span>Category</span>
        <input
          type="text"
          value={optionAName}
          onChange={(e) => setOptionAName(e.target.value)}
          placeholder="Option A"
        />
        <input
          type="text"
          value={optionBName}
          onChange={(e) => setOptionBName(e.target.value)}
          placeholder="Option B"
        />
        <span></span>
      </div>

      {rows.map((row) => (
        <div
          key={row.id}
          className={`table-row ${activeRowId === row.id ? "active" : ""} ${
            row.chartData ? "placed" : ""
          }`}
          onClick={() => setActiveRowId(row.id)}
        >
          <input
            type="text"
            value={row.category}
            onChange={(e) => updateRow(row.id, { category: e.target.value })}
            onFocus={() => setActiveRowId(row.id)}
            placeholder="e.g., Salary"
            onClick={(e) => e.stopPropagation()}
          />
          <input
            type="text"
            value={row.optionA}
            onChange={(e) => updateRow(row.id, { optionA: e.target.value })}
            onFocus={() => setActiveRowId(row.id)}
            placeholder="e.g., $80,000"
            onClick={(e) => e.stopPropagation()}
          />
          <input
            type="text"
            value={row.optionB}
            onChange={(e) => updateRow(row.id, { optionB: e.target.value })}
            onFocus={() => setActiveRowId(row.id)}
            placeholder="e.g., $90,000"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteRow(row.id);
            }}
            title="Delete row"
          >
            ×
          </button>
        </div>
      ))}

      <button className="add-row-button" onClick={addRow}>
        + Add Category
      </button>
    </div>
  );
}
