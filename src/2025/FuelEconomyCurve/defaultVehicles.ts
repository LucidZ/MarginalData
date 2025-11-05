// Default vehicles to populate the chart on load
// Hand-picked representative vehicles from different categories

export type VehicleCategory = "truck" | "suv" | "sedan" | "small" | "hybrid" | "electric";

export interface DefaultVehicle {
  id: number;
  category: VehicleCategory;
  name: string;
}

export const CATEGORY_COLORS: Record<VehicleCategory, string> = {
  truck: "#e67e22",     // Orange
  suv: "#9b59b6",       // Purple
  sedan: "#3498db",     // Blue
  small: "#2ecc71",     // Green
  hybrid: "#16a085",    // Teal
  electric: "#f1c40f",  // Yellow
};

export const CATEGORY_NAMES: Record<VehicleCategory, string> = {
  truck: "Trucks",
  suv: "SUVs",
  sedan: "Sedans",
  small: "Small Cars",
  hybrid: "Hybrids",
  electric: "Electric",
};

// Verified vehicle IDs from fueleconomy.gov API
export const DEFAULT_VEHICLES: DefaultVehicle[] = [
  // Trucks (3)
  { id: 47603, category: "truck", name: "2024 Ford F150 Pickup 2WD" },
  { id: 46811, category: "truck", name: "2024 Chevrolet Silverado 2WD" },
  { id: 47129, category: "truck", name: "2024 Toyota Tundra 4WD" },

  // SUVs (3)
  { id: 46715, category: "suv", name: "2024 Honda CR-V AWD" },
  { id: 47374, category: "suv", name: "2024 Toyota RAV4" },
  { id: 47680, category: "suv", name: "2024 Ford Explorer AWD" },

  // Sedans (3)
  { id: 47103, category: "sedan", name: "2024 Honda Accord" },
  { id: 47085, category: "sedan", name: "2024 Toyota Camry" },
  { id: 46530, category: "sedan", name: "2024 Subaru Impreza" },

  // Small Cars (3)
  { id: 47069, category: "small", name: "2024 Honda Civic 4Dr" },
  { id: 47330, category: "small", name: "2024 Mazda 3 4-Door 2WD" },
  { id: 47007, category: "small", name: "2024 Chevrolet Trax" },

  // Hybrids (3)
  { id: 47243, category: "hybrid", name: "2024 Toyota Prius" },
  { id: 47104, category: "hybrid", name: "2024 Honda Accord Hybrid" },
  { id: 47092, category: "hybrid", name: "2024 Toyota Camry Hybrid LE" },

  // Electric (3)
  { id: 47909, category: "electric", name: "2024 Tesla Model 3 RWD" },
  { id: 48476, category: "electric", name: "2024 Tesla Model Y RWD" },
  { id: 46973, category: "electric", name: "2024 Nissan Leaf" },
];
