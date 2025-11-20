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

  // Square dimensions - side length is sqrt of total area
  const squareSideLength = Math.sqrt(totalAreaSquareInches);
  const crustHeight = crustAreaSquareInches / squareSideLength;
  const cheeseHeight = cheeseAreaSquareInches / squareSideLength;

  // Convert to pixels for SVG (20 pixels = 1 inch)
  const pixelsPerInch = 20;
  const squareSidePx = squareSideLength * pixelsPerInch;
  const crustHeightPx = crustHeight * pixelsPerInch;
  const cheeseHeightPx = cheeseHeight * pixelsPerInch;

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
      <p style={{ textAlign: "center", fontSize: "16px", color: "#666", marginBottom: "1rem" }}>
        All pizzas shown have a 1 inch thick crust
      </p>
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
            {/* Horizontal dimension arrow above square */}
            <svg width={squareSidePx + 4} height={60} style={{ marginBottom: "0.5rem" }}>
              {/* Left arrow */}
              <polygon points="5,45 12,41 12,49" fill="#666" />
              {/* Horizontal line */}
              <line x1={12} y1={45} x2={squareSidePx - 8} y2={45} stroke="#666" strokeWidth={4} />
              {/* Right arrow */}
              <polygon points={`${squareSidePx - 1},45 ${squareSidePx - 8},41 ${squareSidePx - 8},49`} fill="#666" />
              {/* Text */}
              <text x={(squareSidePx + 4) / 2} y={32} textAnchor="middle" fontSize="36" fill="#666" fontWeight="bold">
                {squareSideLength.toFixed(1)}"
              </text>
            </svg>

            <div style={{ display: "flex", gap: "1rem" }}>
              {/* Vertical dimension arrow on left */}
              <svg width={120} height={squareSidePx + 4}>
                {/* Top arrow */}
                <polygon points="75,0 71,8 79,8" fill="#666" />
                {/* Vertical line */}
                <line x1={75} y1={8} x2={75} y2={squareSidePx - 4} stroke="#666" strokeWidth={4} />
                {/* Bottom arrow */}
                <polygon points={`75,${squareSidePx + 4} 71,${squareSidePx - 4} 79,${squareSidePx - 4}`} fill="#666" />
                {/* Text with rotation - positioned to the left */}
                <text
                  x={38}
                  y={(squareSidePx + 4) / 2}
                  textAnchor="middle"
                  fontSize="36"
                  fill="#666"
                  fontWeight="bold"
                  transform={`rotate(-90, 38, ${(squareSidePx + 4) / 2})`}
                >
                  {squareSideLength.toFixed(1)}"
                </text>
              </svg>

              {/* Square */}
              <svg width={squareSidePx + 4} height={squareSidePx + 4} style={{ border: "1px solid #ccc" }}>
              {/* Crust section (top) */}
              <rect
                x={2}
                y={2}
                width={squareSidePx}
                height={crustHeightPx}
                fill="#D2691E"
              />
              {/* Cheese section (bottom) */}
              <rect
                x={2}
                y={crustHeightPx + 2}
                width={squareSidePx}
                height={cheeseHeightPx}
                fill="#FFB84D"
              />
              {/* Crust percentage label */}
              {crustHeightPx > 40 && (
                <text
                  x={squareSidePx / 2 + 2}
                  y={crustHeightPx / 2 + 6}
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
              <svg width={120} height={squareSidePx + 4}>
                {/* Top arrow */}
                <polygon points="45,0 41,8 49,8" fill="#fff" />
                {/* Vertical line */}
                <line x1={45} y1={8} x2={45} y2={squareSidePx - 4} stroke="#fff" strokeWidth={4} />
                {/* Bottom arrow */}
                <polygon points={`45,${squareSidePx + 4} 41,${squareSidePx - 4} 49,${squareSidePx - 4}`} fill="#fff" />
                {/* Text with rotation - positioned to the right */}
                <text
                  x={82}
                  y={(squareSidePx + 4) / 2}
                  textAnchor="middle"
                  fontSize="36"
                  fill="#fff"
                  fontWeight="bold"
                  transform={`rotate(-90, 82, ${(squareSidePx + 4) / 2})`}
                >
                  {squareSideLength.toFixed(1)}"
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
