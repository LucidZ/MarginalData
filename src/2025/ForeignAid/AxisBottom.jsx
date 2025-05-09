export const AxisBottom = ({ xScale, innerHeight, tickFormat }) =>
  xScale.ticks(4).map((tickValue) => (
    <g
      className="tick"
      key={tickValue}
      transform={`translate(${xScale(tickValue)},0)`}
    >
      <line x1={0} y1={0} x2={0} y2={innerHeight} />
      <text style={{ textAnchor: "middle" }} y={innerHeight + 5} dy=".71em">
        {tickFormat(tickValue)}
      </text>
    </g>
  ));
