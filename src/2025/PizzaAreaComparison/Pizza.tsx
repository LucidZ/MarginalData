import React, { useRef, useState } from "react";

interface PizzaProps {
  radius: number;
  setRadius: (radius: number) => void;
  strokeWidth: number;
}

export const Pizza: React.FC<PizzaProps> = ({ radius, setRadius, strokeWidth }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startDistance, setStartDistance] = useState(0);
  const [startRadius, setStartRadius] = useState(radius);

  // SVG dimensions - large enough to accommodate drag interactions
  const svgSize = 500;
  const centerX = svgSize / 2;
  const centerY = svgSize / 2;

  // Helper function to get mouse Y position relative to SVG center
  const getYPositionFromCenter = (clientY: number): number => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const svgCenterY = rect.top + rect.height / 2;
    return clientY - svgCenterY;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartDistance(getYPositionFromCenter(e.clientY));
    setStartRadius(radius);
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const currentY = getYPositionFromCenter(e.clientY);
    const deltaY = currentY - startDistance;
    // Dragging down from top increases radius, dragging up decreases it
    // Scale factor: 1 pixel of Y change = 1 pixel of radius change
    // Min radius 50px (2.5"), Max radius 200px (10") = Min diameter 5", Max diameter 20"
    const newRadius = Math.max(50, Math.min(200, startRadius + deltaY));
    // Snap to multiples of 10
    setRadius(Math.round(newRadius / 10) * 10);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  // Touch event handlers for mobile support
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    const touch = e.touches[0];
    setStartDistance(getYPositionFromCenter(touch.clientY));
    setStartRadius(radius);
    e.preventDefault();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const touch = e.touches[0];
    const currentY = getYPositionFromCenter(touch.clientY);
    const deltaY = currentY - startDistance;
    // Min radius 50px (2.5"), Max radius 200px (10") = Min diameter 5", Max diameter 20"
    const newRadius = Math.max(50, Math.min(200, startRadius + deltaY));
    // Snap to multiples of 10
    setRadius(Math.round(newRadius / 10) * 10);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  return (
    <svg
      ref={svgRef}
      width={svgSize}
      height={svgSize}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {/* Pizza circle */}
      <circle
        cx={centerX}
        cy={centerY}
        r={radius}
        fill="#FFB84D"
        stroke="#D2691E"
        strokeWidth={strokeWidth}
        style={{
          transition: isDragging ? "none" : "r 0.1s ease-out",
        }}
      />
    </svg>
  );
};
