import { csv } from "d3";
import React, { useEffect, useState } from "react";

const csvUrl =
  "https://gist.githubusercontent.com/curran/0ac4077c7fc6390f5dd33bf5c06cb5ff/raw/UN_Population_2019.csv";

export const useData = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    const row = (d) => {
      d.Population = +d["2020"] * 1000;
      return d;
    };
    csv(csvUrl, row).then((data) => {
      setData(data.slice(0, 10));
    });
  }, []);
  return data;
};
