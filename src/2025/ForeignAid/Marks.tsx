import { useAtom, useAtomValue } from "jotai";
import {
  hoveredGuessAtom,
  selectedGuessAtom,
  guess1SubmittedAtom,
  stepAtom,
} from "./atoms.js";
import { max } from "d3";

export const Marks = ({
  graphId,
  data,
  xScale,
  yScale,
  xValue,
  yValue,
  toolTipFormat,
}) => {
  //define atomic states
  const [selectedGuess, setSelectedGuess] = useAtom(selectedGuessAtom);
  const [hoveredGuess, setHoveredGuess] = useAtom(hoveredGuessAtom);
  const guess1Submitted = useAtomValue(guess1SubmittedAtom);
  const [step, setStep] = useAtom(stepAtom);

  // Define color function that takes the data item
  const getColor = (d) => {
    // Use a unique identifier from your data item
    if (selectedGuess === yValue(d)) return "green";
    if (hoveredGuess === yValue(d)) return "green";
    if (step === 2 && yValue(d) === "United States") return "green";
    if (step === 5 && yValue(d) === "United States") return "green";
    return "#D3D3D3";
  };

  const getGuessColor = (d) => {
    if (selectedGuess === yValue(d) || hoveredGuess === yValue(d))
      return "black";
    return "transparent";
  };

  const maxDomain = max(data, xValue);

  //event listeners
  const eventHandlers = (id) => ({
    onMouseOver: () => setHoveredGuess(id),
    onMouseOut: () => setHoveredGuess(null),
    onClick: () => {
      if (selectedGuess === null) {
        setStep(step + 1);
      }
      setSelectedGuess(id);
    },
  });

  return data.map((d) => {
    const id = yValue(d);
    return (
      <g
        key={id}
        {...(guess1Submitted ? {} : eventHandlers(id))}
        style={{ cursor: "pointer" }}
      >
        {/* Invisible hit area rectangle - larger than the visible one */}
        <rect
          x={0}
          y={yScale(yValue(d))}
          width={xScale(maxDomain)}
          height={yScale.bandwidth()}
          fill="transparent"
        />

        {/* Visible rectangle - the actual data representation */}
        <rect
          className="mark"
          key={yValue(d)}
          x={0}
          y={yScale(yValue(d))}
          width={xScale(xValue(d))}
          height={yScale.bandwidth()}
          style={{ fill: getColor(d) }}
        >
          <title>{toolTipFormat(xValue(d))}</title>
        </rect>
        <text
          textAnchor="right"
          x={xScale(xValue(d))}
          y={yScale(yValue(d)) + 13}
          style={{ fill: getGuessColor(d) }}
        >
          - Your Guess
        </text>
      </g>
    );
  });
};
