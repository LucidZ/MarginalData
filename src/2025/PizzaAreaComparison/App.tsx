import "./App.css";
import React, { useState, useRef } from "react";
import { Pizza } from "./Pizza";

const App = () => {
  const [radius, setRadius] = useState(120);

  // Convert pixels to inches (20 pixels = 1 inch)
  const radiusInches = radius / 20;
  const diameterInches = radiusInches * 2;
  const crustThicknessInches = 1; // 20 pixels = 1 inch

  // Calculate areas
  const totalAreaSquareInches = Math.PI * radiusInches * radiusInches;
  const cheeseRadiusInches = radiusInches - crustThicknessInches;
  const cheeseAreaSquareInches = cheeseRadiusInches > 0
    ? Math.PI * cheeseRadiusInches * cheeseRadiusInches
    : 0;
  const crustAreaSquareInches = totalAreaSquareInches - cheeseAreaSquareInches;

  // Rectangle dimensions
  const rectangleHeight = 5; // inches
  const crustWidth = crustAreaSquareInches / rectangleHeight;
  const cheeseWidth = cheeseAreaSquareInches / rectangleHeight;
  const totalWidth = crustWidth + cheeseWidth;

  // Convert to pixels for SVG (20 pixels = 1 inch)
  const pixelsPerInch = 20;
  const rectHeightPx = rectangleHeight * pixelsPerInch;
  const crustWidthPx = crustWidth * pixelsPerInch;
  const cheeseWidthPx = cheeseWidth * pixelsPerInch;
  const totalWidthPx = totalWidth * pixelsPerInch;

  // Calculate crust percentage
  const crustPercentage = (crustAreaSquareInches / totalAreaSquareInches) * 100;

  return (
    <div className="container">
      <h2>How much more pizza is a large?</h2>
      <div className="pizza-container">
        <div style={{ position: "relative" }}>
          <Pizza radius={radius} setRadius={setRadius} strokeWidth={20} />
          <svg
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none"
            }}
            width={radius * 2 + 20}
            height={30}
          >
            {/* Left arrow */}
            <line x1={10} y1={15} x2={20} y2={15} stroke="#fff" strokeWidth={3} />
            <polygon points="10,15 16,11 16,19" fill="#fff" />
            {/* Right arrow */}
            <line x1={radius * 2 + 20 - 20} y1={15} x2={radius * 2 + 20 - 10} y2={15} stroke="#fff" strokeWidth={3} />
            <polygon points={`${radius * 2 + 20 - 10},15 ${radius * 2 + 20 - 16},11 ${radius * 2 + 20 - 16},19`} fill="#fff" />
            {/* Horizontal line */}
            <line x1={20} y1={15} x2={radius * 2 + 20 - 20} y2={15} stroke="#fff" strokeWidth={3} />
            {/* Text with black outline */}
            <text
              x={(radius * 2 + 20) / 2}
              y={12}
              textAnchor="middle"
              fontSize="16"
              fill="#fff"
              fontWeight="bold"
              stroke="#000"
              strokeWidth={0.5}
            >
              {diameterInches}"
            </text>
          </svg>
        </div>
      </div>

      <div className="rectangle-container">
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
          {/* Vertical dimension arrow (5") */}
          <svg width={50} height={rectHeightPx + 4} style={{ marginTop: 0 }}>
            {/* Top arrow */}
            <line x1={15} y1={7} x2={15} y2={17} stroke="#666" strokeWidth={2} />
            <polygon points="15,7 12,12 18,12" fill="#666" />
            {/* Bottom arrow */}
            <line x1={15} y1={rectHeightPx - 13} x2={15} y2={rectHeightPx - 3} stroke="#666" strokeWidth={2} />
            <polygon points={`15,${rectHeightPx - 3} 12,${rectHeightPx - 8} 18,${rectHeightPx - 8}`} fill="#666" />
            {/* Vertical line */}
            <line x1={15} y1={17} x2={15} y2={rectHeightPx - 13} stroke="#666" strokeWidth={2} />
            {/* Text with more space from arrow */}
            <text
              x={30}
              y={(rectHeightPx + 4) / 2 + 4}
              textAnchor="middle"
              fontSize="14"
              fill="#666"
              transform={`rotate(-90, 30, ${(rectHeightPx + 4) / 2 + 4})`}
            >
              5"
            </text>
          </svg>

          <div>
            <svg width={totalWidthPx + 4} height={rectHeightPx + 4} style={{ border: "1px solid #ccc" }}>
              {/* Crust section (left side) */}
              <rect
                x={2}
                y={2}
                width={crustWidthPx}
                height={rectHeightPx}
                fill="#D2691E"
              />
              {/* Cheese section (right side) */}
              <rect
                x={crustWidthPx + 2}
                y={2}
                width={cheeseWidthPx}
                height={rectHeightPx}
                fill="#FFB84D"
              />
              {/* Crust percentage label */}
              {crustWidthPx > 40 && (
                <text
                  x={crustWidthPx / 2 + 2}
                  y={rectHeightPx / 2 + 6}
                  textAnchor="middle"
                  fontSize="14"
                  fill="#fff"
                  fontWeight="bold"
                >
                  {crustPercentage.toFixed(0)}%
                </text>
              )}
            </svg>

            {/* Horizontal dimension arrow below */}
            <div className="dimension-label">
              <svg width={totalWidthPx + 4} height={30}>
                {/* Left arrow */}
                <line x1={5} y1={15} x2={15} y2={15} stroke="#666" strokeWidth={2} />
                <polygon points="5,15 10,12 10,18" fill="#666" />
                {/* Right arrow */}
                <line x1={totalWidthPx - 11} y1={15} x2={totalWidthPx - 1} y2={15} stroke="#666" strokeWidth={2} />
                <polygon points={`${totalWidthPx - 1},15 ${totalWidthPx - 6},12 ${totalWidthPx - 6},18`} fill="#666" />
                {/* Horizontal line */}
                <line x1={15} y1={15} x2={totalWidthPx - 11} y2={15} stroke="#666" strokeWidth={2} />
                {/* Text */}
                <text x={(totalWidthPx + 4) / 2} y={12} textAnchor="middle" fontSize="14" fill="#666">
                  {totalWidth.toFixed(1)}"
                </text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="info-section">
        <p>Diameter: {diameterInches}"</p>
        <p>Total Area: {totalAreaSquareInches.toFixed(1)} in²</p>
        <p>Cheese Area: {cheeseAreaSquareInches.toFixed(1)} in²</p>
        <p>Crust Area: {crustAreaSquareInches.toFixed(1)} in²</p>
      </div>
    </div>
  );
};

export default App;
