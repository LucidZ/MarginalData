import { useState } from "react";
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
  reorderRows: (fromIndex: number, toIndex: number) => void;
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
  reorderRows,
}: ComparisonTableProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null) {
      reorderRows(draggedIndex, dragOverIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="comparison-table">
      <h2>Compare the Facts</h2>
      <p className="step-description">
        List the objective differences between your options (salary, commute
        time, etc.)
      </p>

      <div className="table-headers">
        <span>⇅</span>
        <span>Category</span>
        <input
          type="text"
          value={optionAName}
          onChange={(e) => setOptionAName(e.target.value)}
          placeholder="e.g. Startup Job"
        />
        <input
          type="text"
          value={optionBName}
          onChange={(e) => setOptionBName(e.target.value)}
          placeholder="e.g. Current Job"
        />
        <span></span>
      </div>

      {rows.map((row, index) => {
        // Define placeholder example
        const placeholder = {
          category: "Category",
          optionA: "Value",
          optionB: "Value",
        };

        return (
          <div
            key={row.id}
            className={`table-row ${activeRowId === row.id ? "active" : ""} ${
              draggedIndex === index ? "dragging" : ""
            } ${dragOverIndex === index ? "drag-over" : ""}`}
            onClick={() => setActiveRowId(row.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
          >
            <div className="drag-handle" title="Drag to reorder">
              ⋮⋮
            </div>
            <input
              type="text"
              value={row.category}
              onChange={(e) => updateRow(row.id, { category: e.target.value })}
              onFocus={() => setActiveRowId(row.id)}
              placeholder={placeholder.category}
              onClick={(e) => e.stopPropagation()}
            />
            <input
              type="text"
              value={row.optionA}
              onChange={(e) => updateRow(row.id, { optionA: e.target.value })}
              onFocus={() => setActiveRowId(row.id)}
              placeholder={placeholder.optionA}
              onClick={(e) => e.stopPropagation()}
            />
            <input
              type="text"
              value={row.optionB}
              onChange={(e) => updateRow(row.id, { optionB: e.target.value })}
              onFocus={() => setActiveRowId(row.id)}
              placeholder={placeholder.optionB}
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
        );
      })}

      <button className="add-row-button" onClick={addRow}>
        + Add Category
      </button>
    </div>
  );
}
