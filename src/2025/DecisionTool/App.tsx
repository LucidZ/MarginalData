import { useState } from "react";
import "./App.css";
import ComparisonTable from "./ComparisonTable";
import ValueJoyChart from "./ValueJoyChart";

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
  const [optionAName, setOptionAName] = useState("Option A");
  const [optionBName, setOptionBName] = useState("Option B");
  const [rows, setRows] = useState<ComparisonRow[]>([
    {
      id: "1",
      category: "Salary",
      optionA: "$80,000",
      optionB: "$90,000",
    },
  ]);
  const [activeRowId, setActiveRowId] = useState<string | null>("1");

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

  return (
    <div className="decision-tool">
      <header>
        <h1>Decision Tool</h1>
        <p className="subtitle">
          Compare two options and visualize what matters most
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
        />

        <ValueJoyChart
          optionAName={optionAName}
          optionBName={optionBName}
          rows={rows}
          activeRowId={activeRowId}
          updateChartData={updateChartData}
        />
      </div>
    </div>
  );
}
