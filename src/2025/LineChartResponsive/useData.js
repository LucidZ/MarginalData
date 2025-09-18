import { csv } from "d3";
import { useEffect } from "react";
import { dataAtom } from "./atoms";
import { useAtom } from "jotai";

const csvUrl = "/data/Federal Employment Data.csv";

export const useData = () => {
  //const [data, setData] = useState(null);
  const [data, setData] = useAtom(dataAtom);

  useEffect(() => {
    const row = (d) => {
      d.timestamp = new Date(d.Month);
      d.TotalNonFarm = +d["TotalNonFarm"] * 1000;
      d.Federal = +d["Federal"] * 1000;
      return d;
    };
    csv(csvUrl, row).then((data) => {
      setData(data);
    });
  }, []);
  console.log(data);
  return data;
};
