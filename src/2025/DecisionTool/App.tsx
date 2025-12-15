import { useState } from "react";
import "./App.css";
import ComparisonTable from "./ComparisonTable";
import ValueJoyChart from "./ValueJoyChart";
import VectorAdditionChart from "./VectorAdditionChart";

export interface ComparisonRow {
  id: string;
  category: string;
  optionA: string;
  optionB: string;
  chartData?: {
    aPosition: { x: number; y: number };
    bPosition: { x: number; y: number };
  };
}

export default function DecisionTool() {
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

  const updateChartData = (
    id: string,
    aPosition: { x: number; y: number },
    bPosition: { x: number; y: number }
  ) => {
    setRows(
      rows.map((row) =>
        row.id === id ? { ...row, chartData: { aPosition, bPosition } } : row
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
        <h1>Decision Vectorizer</h1>
        <p className="subtitle">
          No decision tool is perfect, but some are useful.
        </p>
        <p className="intro-text">
          Choosing between two options? This tool helps you see the full picture by
          mapping both the facts and your feelings about each choice. Perfect for
          job offers, living situations, or any major decision.
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

        <ValueJoyChart
          optionAName={optionAName}
          optionBName={optionBName}
          rows={rows}
          activeRowId={activeRowId}
          updateChartData={updateChartData}
        />

        <VectorAdditionChart
          optionAName={optionAName}
          optionBName={optionBName}
          rows={rows}
        />
      </div>

      <footer className="tool-footer">
        <div className="insight-tip">
          <p style={{ fontStyle: "italic", marginBottom: "0.5rem" }}>
            <strong>Still unsure?</strong> Try using the tool again with different scenarios:
          </p>
          <ul style={{ textAlign: "left", maxWidth: "600px", margin: "0 auto", paddingLeft: "1.5rem" }}>
            <li>Fill everything out assuming the best-case scenario, then the worst-case</li>
            <li>Assume the best for one option and the worst for the other</li>
          </ul>
          <p style={{ fontStyle: "italic", marginTop: "0.5rem" }}>
            The goal isn't always to find the optimal choice, but to gain new insights about what matters most to you.
          </p>
        </div>
        <p style={{ marginTop: "1.5rem" }}>
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
