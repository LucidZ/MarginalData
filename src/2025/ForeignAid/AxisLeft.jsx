import { guess1SubmittedAtom } from "./atoms.js";
import { useAtomValue } from "jotai";

export const AxisLeft = ({ yScale }) => {
  const guess1Submitted = useAtomValue(guess1SubmittedAtom);

  if (guess1Submitted === false) return null;

  return (
    <>
      {yScale.domain().map((tickValue, i) => (
        <g className="tick" key={i}>
          <text
            style={{ textAnchor: "end" }}
            dy=".32em"
            x={-5}
            y={yScale(tickValue) + yScale.bandwidth() / 2}
          >
            {tickValue}
          </text>
        </g>
      ))}
    </>
  );
};
