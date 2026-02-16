import { useState, useEffect } from "react";
import type { PopulationData, YearData } from "./types";

export const useData = () => {
  const [data, setData] = useState<YearData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch(
          new URL("./data/us_population.json", import.meta.url).href
        );

        if (!response.ok) {
          throw new Error(`Failed to load data: ${response.statusText}`);
        }

        const rawData: PopulationData[] = await response.json();

        // Group data by year
        const yearMap = new Map<number, PopulationData[]>();

        rawData.forEach((record) => {
          if (!yearMap.has(record.year)) {
            yearMap.set(record.year, []);
          }
          yearMap.get(record.year)!.push(record);
        });

        // Convert to YearData array
        const processedData: YearData[] = Array.from(yearMap.entries())
          .map(([year, records]) => ({
            year,
            ageGroups: records
              .sort((a, b) => a.age - b.age)
              .map((r) => ({
                age: r.age,
                male: r.male,
                female: r.female,
              })),
          }))
          .sort((a, b) => a.year - b.year);

        setData(processedData);
        setLoading(false);
      } catch (err) {
        console.error("Error loading population data:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return { data, loading, error };
};
