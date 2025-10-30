import { scaleBand, scaleLinear, max } from "d3";
import { AxisBottom } from "./AxisBottom";
import { AxisLeft } from "./AxisLeft";
import { Marks } from "./Marks";
import { guess1SubmittedAtom, stepAtom } from "./atoms";
import { useAtomValue } from "jotai";
import { XAxisTitle } from "./XAxisTitle";

export const BarGraphVertical = ({
  graphId,
  width,
  height,
  margin,
  data,
  yValue,
  xValue,
  siFormat,
  xAxisTickFormat,
}) => {
  const innerHeight = height - margin.top - margin.bottom;
  const innerWidth = width - margin.left - margin.right;

  const yScale = scaleBand()
    .domain(data.map(yValue))
    .range([0, innerHeight])
    .paddingInner(0.1);

  const xScale = scaleLinear()
    .domain([0, max(data, xValue)])
    .range([0, innerWidth]);

  const guess1Submitted = useAtomValue(guess1SubmittedAtom);

  return (
    <svg width={width} height={height}>
      <g transform={`translate(${margin.left},${margin.top})`}>
        <AxisBottom
          xScale={xScale}
          innerHeight={innerHeight}
          tickFormat={xAxisTickFormat}
        />
        <AxisLeft yScale={yScale} />
        <XAxisTitle innerWidth={innerWidth} innerHeight={innerHeight} />
        <Marks
          data={data}
          xScale={xScale}
          yScale={yScale}
          xValue={xValue}
          yValue={yValue}
          toolTipFormat={xAxisTickFormat}
        />
      </g>
    </svg>
  );
};
