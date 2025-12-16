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
  const [optionAName, setOptionAName] = useState("Current Job");
  const [optionBName, setOptionBName] = useState("New Job");
  const [rows, setRows] = useState<ComparisonRow[]>([
    {
      id: "1",
      category: "Compensation",
      optionA: "$50",
      optionB: "$45k",
      sliderData: {
        joyA: 0.55,
        joyB: 0.5,
        valueA: 0.6,
        valueB: 0.5,
      },
    },
    {
      id: "2",
      category: "Tech",
      optionA: "Legacy",
      optionB: "Modern Greenfield",
      sliderData: {
        joyA: 0.5,
        joyB: 0.8,
        valueA: 0.3,
        valueB: 0.7,
      },
    },
    {
      id: "3",
      category: "People",
      optionA: "Kind of Toxic",
      optionB: "Smart",
      sliderData: {
        joyA: 0.2,
        joyB: 0.6,
        valueA: 0.7,
        valueB: 0.5,
      },
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
        row.id === id
          ? { ...row, sliderData: { joyA, joyB, valueA, valueB } }
          : row
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
          Analyze decisions by breaking them into individual factors and
          visualizing how each component contributes to the overall choice.
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
        <div className="insight-tip">
          <p style={{ fontStyle: "italic", marginBottom: "0.5rem" }}>
            <strong>Still unsure?</strong> Try using the tool again with
            different scenarios:
          </p>
          <ul
            style={{
              textAlign: "left",
              maxWidth: "600px",
              margin: "0 auto",
              paddingLeft: "1.5rem",
            }}
          >
            <li>
              Fill everything out assuming the best-case scenario, then the
              worst-case
            </li>
            <li>Assume the best for one option and the worst for the other</li>
          </ul>
          <p style={{ fontStyle: "italic", marginTop: "0.5rem" }}>
            The goal isn't always to find the optimal choice, but to gain new
            insights about what matters most to you.
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
