export interface PopulationData {
  year: number;
  age: number;
  male: number;
  female: number;
}

export interface YearData {
  year: number;
  ageGroups: AgeGroup[];
}

export interface AgeGroup {
  age: number;
  male: number;
  female: number;
}

export interface HighlightedCohort {
  id: string;
  birthYear: number;
  color: string;
  label: string;
}
