// Default vehicles to populate the chart on load
// Hand-picked representative vehicles from different categories

export type VehicleCategory = "truck" | "suv" | "sedan" | "hybrid" | "electric" | "sports";

export interface DefaultVehicle {
  id: number;
  category: VehicleCategory;
  name: string;
}

export const CATEGORY_COLORS: Record<VehicleCategory, string> = {
  truck: "#e67e22",     // Orange
  suv: "#9b59b6",       // Purple
  sedan: "#3498db",     // Blue
  hybrid: "#16a085",    // Teal
  electric: "#f1c40f",  // Yellow
  sports: "#e74c3c",    // Red
};

export const CATEGORY_NAMES: Record<VehicleCategory, string> = {
  truck: "Trucks",
  suv: "SUVs",
  sedan: "Sedans",
  hybrid: "Hybrids",
  electric: "Electric",
  sports: "Sports Cars",
};

// Verified vehicle IDs from fueleconomy.gov API
export const DEFAULT_VEHICLES: DefaultVehicle[] = [
  // Trucks (4)
  { id: 48884, category: "truck", name: "2025 Ford F150 Pickup 2WD" },
  { id: 48199, category: "truck", name: "2025 Chevrolet Silverado 2WD" },
  { id: 48510, category: "truck", name: "2025 Toyota Tundra 2WD" },
  { id: 47723, category: "truck", name: "2025 RAM 1500 2WD" },

  // SUVs (3)
  { id: 47956, category: "suv", name: "2025 Honda CR-V AWD" },
  { id: 48910, category: "suv", name: "2025 Toyota RAV4" },
  { id: 48118, category: "suv", name: "2025 Ford Explorer AWD" },

  // Sedans (2)
  { id: 48504, category: "sedan", name: "2025 Honda Accord" },
  { id: 48507, category: "sedan", name: "2025 Subaru Impreza" },

  // Hybrids (3)
  { id: 48861, category: "hybrid", name: "2025 Toyota Prius" },
  { id: 48505, category: "hybrid", name: "2025 Honda Accord Hybrid" },
  { id: 48937, category: "hybrid", name: "2025 Toyota RAV4 Hybrid AWD" },

  // Electric (6)
  { id: 48764, category: "electric", name: "2025 Tesla Model 3 Long Range AWD" },
  { id: 49152, category: "electric", name: "2025 Tesla Cybertruck Long Range" },
  { id: 49077, category: "electric", name: "2025 Ford F-150 Lightning 4WD" },
  { id: 48422, category: "electric", name: "2025 Rivian R1T Dual Max" },
  { id: 48374, category: "electric", name: "2025 Lucid Air Pure RWD" },
  { id: 48405, category: "electric", name: "2025 Polestar 2 Single Motor" },

  // Sports Cars (3)
  { id: 48809, category: "sports", name: "2025 Porsche 718 Boxster" },
  { id: 48658, category: "sports", name: "2025 Ferrari 296 GTB" },
  { id: 48581, category: "sports", name: "2025 Lamborghini Revuelto" },
];
