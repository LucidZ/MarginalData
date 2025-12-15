import { useState } from "react";
import "./App.css";
import ComparisonTable from "./ComparisonTable";
import ComponentSliders from "./ComponentSliders";
import VectorAdditionChart from "./VectorAdditionChart";

export interface ComparisonRow {
  id: string;
  category: string;
  optionA: string;
  optionB: string;
  sliderData?: {
    joyA: number; // 0 to 1, where 0 is "Ugh!" and 1 is "Sparks Joy!"
    joyB: number;
    valueA: number; // 0 to 1, where 0 is "Low Value" and 1 is "High Value"
    valueB: number;
  };
}

export default function DecisionComponentAnalyzer() {
  const [optionAName, setOptionAName] = useState("");
  const [optionBName, setOptionBName] = useState("");
  const [rows, setRows] = useState<ComparisonRow[]>([
    {
      id: "1",
      category: "",
      optionA: "",
      optionB: "",
    },
  ]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const addRow = () => {
    const newRow: ComparisonRow = {
      id: Date.now().toString(),
      category: "",
      optionA: "",
      optionB: "",
    };
    setRows([...rows, newRow]);
  };

  const deleteRow = (id: string) => {
    setRows(rows.filter((row) => row.id !== id));
    if (activeRowId === id) {
      setActiveRowId(null);
    }
  };

  const updateRow = (id: string, updates: Partial<ComparisonRow>) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, ...updates } : row)));
  };

  const updateSliderData = (
    id: string,
    joyA: number,
    joyB: number,
    valueA: number,
    valueB: number
  ) => {
    setRows(
      rows.map((row) =>
        row.id === id ? { ...row, sliderData: { joyA, joyB, valueA, valueB } } : row
      )
    );
  };

  const reorderRows = (fromIndex: number, toIndex: number) => {
    const newRows = [...rows];
    const [movedRow] = newRows.splice(fromIndex, 1);
    newRows.splice(toIndex, 0, movedRow);
    setRows(newRows);
  };

  return (
    <div className="decision-tool">
      <header>
        <h1>Decision Component Analyzer</h1>
        <p className="subtitle">
          Break down complex decisions into manageable components.
        </p>
        <p className="intro-text">
          Analyze decisions by breaking them into individual factors and visualizing
          how each component contributes to the overall choice.
        </p>
      </header>

      <div className="tool-container">
        <ComparisonTable
          optionAName={optionAName}
          optionBName={optionBName}
          setOptionAName={setOptionAName}
          setOptionBName={setOptionBName}
          rows={rows}
          addRow={addRow}
          deleteRow={deleteRow}
          updateRow={updateRow}
          activeRowId={activeRowId}
          setActiveRowId={setActiveRowId}
          reorderRows={reorderRows}
        />

        <ComponentSliders
          optionAName={optionAName}
          optionBName={optionBName}
          rows={rows}
          updateSliderData={updateSliderData}
        />

        <VectorAdditionChart
          optionAName={optionAName}
          optionBName={optionBName}
          rows={rows}
        />
      </div>

      <footer className="tool-footer">
        <p>
          Inspired by{" "}
          <a
            href="https://labs.davidbauer.ch/priority-compass/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Priority Compass
          </a>
        </p>
      </footer>
    </div>
  );
}
