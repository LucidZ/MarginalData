import { stepAtom } from "./atoms";
import { useAtomValue } from "jotai";

export const XAxisTitle = ({ innerWidth, innerHeight }) => {
  const step = useAtomValue(stepAtom);

  if (step < 3) {
    return (
      <text
        className="axis-label"
        x={innerWidth / 2}
        y={innerHeight + 60}
        textAnchor="middle"
      >
        Billions of US Dollars
      </text>
    );
  } else {
    return (
      <text
        className="axis-label"
        x={innerWidth / 2}
        y={innerHeight + 60}
        textAnchor="middle"
      >
        % of Gross National Income
      </text>
    );
  }
};
