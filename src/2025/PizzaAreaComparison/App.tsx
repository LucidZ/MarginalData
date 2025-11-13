import "./App.css";
import React, { useState, useRef } from "react";

const App = () => {
  const [radius, setRadius] = useState(120);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startRadius, setStartRadius] = useState(radius);
  const svgRef = useRef<SVGSVGElement>(null);

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

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartY(e.clientY);
    setStartRadius(radius);
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaY = e.clientY - startY;
    const newRadius = Math.max(50, Math.min(200, startRadius + deltaY));
    setRadius(Math.round(newRadius / 10) * 10);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
    setStartRadius(radius);
    e.preventDefault();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const deltaY = e.touches[0].clientY - startY;
    const newRadius = Math.max(50, Math.min(200, startRadius + deltaY));
    setRadius(Math.round(newRadius / 10) * 10);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  return (
    <div className="container">
      <h2>How much more pizza is a large?</h2>
      <svg
        ref={svgRef}
        width={radius * 2 + 40}
        height={radius * 2 + 40}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
          touchAction: "none",
          display: "block",
          margin: "0 auto"
        }}
      >
        {/* Pizza circle */}
        <circle
          cx={radius + 20}
          cy={radius + 20}
          r={radius}
          fill="#FFB84D"
          stroke="#D2691E"
          strokeWidth={20}
        />
        {/* Diameter dimension arrow */}
        <polygon points={`10,${radius + 20} 18,${radius + 14} 18,${radius + 26}`} fill="#fff" />
        <line x1={18} y1={radius + 20} x2={radius * 2 + 22} y2={radius + 20} stroke="#fff" strokeWidth={5} />
        <polygon points={`${radius * 2 + 30},${radius + 20} ${radius * 2 + 22},${radius + 14} ${radius * 2 + 22},${radius + 26}`} fill="#fff" />
        <text
          x={radius + 20}
          y={radius + 10}
          fontSize="40"
          fill="#fff"
          fontWeight="bold"
          stroke="#000"
          strokeWidth={1}
        >
          <tspan textAnchor="middle">{diameterInches}</tspan>
          <tspan fontSize="30" textAnchor="start">"</tspan>
        </text>
      </svg>

      <div className="rectangle-container">
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
          <div>
            {/* Horizontal dimension arrow above rectangle */}
            <svg width={rectHeightPx + 4} height={60} style={{ marginBottom: "0.5rem" }}>
              {/* Left arrow */}
              <polygon points="5,45 12,41 12,49" fill="#666" />
              {/* Horizontal line */}
              <line x1={12} y1={45} x2={rectHeightPx - 8} y2={45} stroke="#666" strokeWidth={4} />
              {/* Right arrow */}
              <polygon points={`${rectHeightPx - 1},45 ${rectHeightPx - 8},41 ${rectHeightPx - 8},49`} fill="#666" />
              {/* Text */}
              <text x={(rectHeightPx + 4) / 2} y={32} textAnchor="middle" fontSize="36" fill="#666" fontWeight="bold">
                5"
              </text>
            </svg>

            <div style={{ display: "flex", gap: "1rem" }}>
              {/* Vertical dimension arrow on left */}
              <svg width={120} height={totalWidthPx + 4}>
                {/* Top arrow */}
                <polygon points="75,0 71,8 79,8" fill="#666" />
                {/* Vertical line */}
                <line x1={75} y1={8} x2={75} y2={totalWidthPx - 4} stroke="#666" strokeWidth={4} />
                {/* Bottom arrow */}
                <polygon points={`75,${totalWidthPx + 4} 71,${totalWidthPx - 4} 79,${totalWidthPx - 4}`} fill="#666" />
                {/* Text with rotation - positioned to the left */}
                <text
                  x={38}
                  y={(totalWidthPx + 4) / 2}
                  textAnchor="middle"
                  fontSize="36"
                  fill="#666"
                  fontWeight="bold"
                  transform={`rotate(-90, 38, ${(totalWidthPx + 4) / 2})`}
                >
                  {totalWidth.toFixed(1)}"
                </text>
              </svg>

              {/* Vertical rectangle */}
              <svg width={rectHeightPx + 4} height={totalWidthPx + 4} style={{ border: "1px solid #ccc" }}>
              {/* Crust section (top) */}
              <rect
                x={2}
                y={2}
                width={rectHeightPx}
                height={crustWidthPx}
                fill="#D2691E"
              />
              {/* Cheese section (bottom) */}
              <rect
                x={2}
                y={crustWidthPx + 2}
                width={rectHeightPx}
                height={cheeseWidthPx}
                fill="#FFB84D"
              />
              {/* Crust percentage label */}
              {crustWidthPx > 40 && (
                <text
                  x={rectHeightPx / 2 + 2}
                  y={crustWidthPx / 2 + 6}
                  textAnchor="middle"
                  fontSize="18"
                  fill="#fff"
                  fontWeight="bold"
                >
                  {crustPercentage.toFixed(0)}% crust
                </text>
              )}
              </svg>

              {/* Vertical dimension arrow on right (mirror) */}
              <svg width={120} height={totalWidthPx + 4}>
                {/* Top arrow */}
                <polygon points="45,0 41,8 49,8" fill="#fff" />
                {/* Vertical line */}
                <line x1={45} y1={8} x2={45} y2={totalWidthPx - 4} stroke="#fff" strokeWidth={4} />
                {/* Bottom arrow */}
                <polygon points={`45,${totalWidthPx + 4} 41,${totalWidthPx - 4} 49,${totalWidthPx - 4}`} fill="#fff" />
                {/* Text with rotation - positioned to the right */}
                <text
                  x={82}
                  y={(totalWidthPx + 4) / 2}
                  textAnchor="middle"
                  fontSize="36"
                  fill="#fff"
                  fontWeight="bold"
                  transform={`rotate(-90, 82, ${(totalWidthPx + 4) / 2})`}
                >
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
