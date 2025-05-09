/*manually scrapped data from the graph here:
https://www.oecd.org/en/topics/policy-issues/official-development-assistance-oda.html
*/
import { dataAtom } from "./atoms";
import { useAtom } from "jotai";
import { useEffect } from "react";

export const useDataOffline = () => {
  const [data, setData] = useAtom(dataAtom);

  const manualData = [
    { Country: "United States", ODA: 64.69, ODAPercent: 0.0024 },
    { Country: "Germany", ODA: 37.9, ODAPercent: 0.0082 },
    { Country: "Japan", ODA: 19.6, ODAPercent: 0.0044 },
    { Country: "United Kingdom", ODA: 19.07, ODAPercent: 0.0058 },
    { Country: "France", ODA: 15.05, ODAPercent: 0.0048 },
    { Country: "Canada", ODA: 7.97, ODAPercent: 0.0038 },
    { Country: "Netherlands", ODA: 7.36, ODAPercent: 0.0066 },
    { Country: "Italy", ODA: 6.12, ODAPercent: 0.0027 },
    { Country: "Sweden", ODA: 5.62, ODAPercent: 0.0093 },
    { Country: "Norway", ODA: 5.55, ODAPercent: 0.0109 },
    { Country: "Switzerland", ODA: 5.22, ODAPercent: 0.006 },
    { Country: "Spain", ODA: 3.88, ODAPercent: 0.0024 },
    { Country: "Australia", ODA: 3.25, ODAPercent: 0.0019 },
    { Country: "Korea", ODA: 3.16, ODAPercent: 0.0017 },
    { Country: "Denmark", ODA: 3.06, ODAPercent: 0.0073 },
    { Country: "Ireland", ODA: 2.82, ODAPercent: 0.0067 },
    { Country: "Belgium", ODA: 2.81, ODAPercent: 0.0044 },
    { Country: "Poland", ODA: 2.58, ODAPercent: 0.0033 },
    { Country: "Austria", ODA: 1.96, ODAPercent: 0.0038 },
    { Country: "Finland", ODA: 1.59, ODAPercent: 0.0054 },
    { Country: "Czechia", ODA: 0.81, ODAPercent: 0.0024 },
    { Country: "New Zealand", ODA: 0.76, ODAPercent: 0.0031 },
    { Country: "Luxembourg", ODA: 0.58, ODAPercent: 0.0099 },
    { Country: "Portugal", ODA: 0.53, ODAPercent: 0.0019 },
    { Country: "Greece", ODA: 0.33, ODAPercent: 0.0014 },
    { Country: "Hungary", ODA: 0.27, ODAPercent: 0.0013 },
    { Country: "Lithuania", ODA: 0.21, ODAPercent: 0.003 },
    { Country: "Slovak Republic", ODA: 0.18, ODAPercent: 0.0014 },
    { Country: "Slovenia", ODA: 0.16, ODAPercent: 0.0024 },
    { Country: "Iceland", ODA: 0.11, ODAPercent: 0.0035 },
    { Country: "Estonia", ODA: 0.11, ODAPercent: 0.0028 },
  ];

  useEffect(() => {
    setData(manualData);
  }, []);

  return data; //this could be deleted no problem
};
