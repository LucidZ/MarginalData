import { csv } from "d3";
import { useEffect } from "react";
import { dataAtom } from "./atoms";
import { useAtom } from "jotai";

const csvUrl = "/data/Federal Employment Data.csv";

export interface FederalEmploymentData {
  timestamp: Date;
  TotalNonFarm: number;
  Federal: number;
  Month: string;
}

export const useData = (): FederalEmploymentData[] | null => {
  //const [data, setData] = useState(null);
  const [data, setData] = useAtom(dataAtom);

  useEffect(() => {
    const row = (d: any): FederalEmploymentData => {
      return {
        ...d,
        timestamp: new Date(d.Month),
        TotalNonFarm: +d["TotalNonFarm"] * 1000,
        Federal: +d["Federal"] * 1000,
      };
    };
    csv(csvUrl, row).then((data) => {
      setData(data);
    });
  }, [setData]);
  console.log(data);
  return data;
};
