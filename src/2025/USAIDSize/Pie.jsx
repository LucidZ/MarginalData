import { BackgroundCircle } from "./BackgroundCircle.jsx";
import { PieContainer } from "./PieContainer.jsx";
import { PieSlice } from "./PieSlice.jsx";

export const Pie = ({
  width,
  height,
  centerX,
  centerY,
  strokeWidth,
  endPercent,
  isDraggable,
}) => (
  <PieContainer
    width={width}
    height={height}
    centerX={centerX}
    centerY={centerY}
    isDraggable={isDraggable}
  >
    <BackgroundCircle
      radius={centerY - strokeWidth / 2}
      strokeWidth={strokeWidth}
    />
    <PieSlice
      radius={centerY - strokeWidth}
      startPercent={0}
      isDraggable={isDraggable}
      endPercent={endPercent}
    />
  </PieContainer>
);
