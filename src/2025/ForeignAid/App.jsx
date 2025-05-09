import "./App.css";
import React, { useEffect, useState, useCallback } from "react";
import { csv, scaleBand, scaleLinear, max, format } from "d3";
import { useData } from "./useData.js";
import { useDataOffline } from "./useDataOffline.js";
import { BarGraphVertical } from "./BarGraphVertical.jsx";
import { ButtonToSubmitGuess1 } from "./ButtonToSubmitGuess1.jsx";
import { Question } from "./Question.jsx";
import { xValueColumnAtom, siFormatAtom } from "./atoms.js";
import { useAtomValue } from "jotai";

const width = 600;
const height = 600;
const margin = { top: 20, right: 120, bottom: 80, left: 120 };
const yValue = (d) => d.Country;
//const siFormat = format(".2s");

const App = () => {
  const data = useDataOffline();
  const xValue = (d) => d[useAtomValue(xValueColumnAtom)];
  const siFormat = format(useAtomValue(siFormatAtom));
  const xAxisTickFormat = (tickValue) =>
    siFormat(tickValue).replace("G", "B").replace(".0", "");

  if (!data) {
    return <pre>Data is Loading...</pre>;
  }

  return (
    <div className="app-container">
      <Question />
      <ButtonToSubmitGuess1 />
      <BarGraphVertical
        width={width}
        height={height}
        margin={margin}
        data={data}
        yValue={yValue}
        xValue={xValue}
        siFormat={siFormat}
        xAxisTickFormat={xAxisTickFormat}
      />
    </div>
  );
};

export default App;
