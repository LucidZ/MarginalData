export const AxisLeft = ({ yScale, innerWidth, tickFormat, tickOffset = 3 }) =>
  yScale.ticks().map((tickValue) => (
    <g
      className="tick no-select"
      transform={`translate(0,${yScale(tickValue)})`}
    >
      <line x2={innerWidth} />
      <text
        key={tickValue}
        style={{ textAnchor: "end" }}
        x={-tickOffset}
        dy=".32em"
      >
        {tickFormat(tickValue)}
      </text>
    </g>
  ));
