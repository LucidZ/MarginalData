// API service for fueleconomy.gov
const BASE_URL = 'https://www.fueleconomy.gov/ws/rest';

export interface MenuYear {
  value: string;
  text: string;
}

export interface MenuMake {
  value: string;
  text: string;
}

export interface MenuModel {
  value: string;
  text: string;
}

export interface VehicleOption {
  text: string;
  value: string;
}

export interface ApiVehicle {
  id: number;
  year: number;
  make: string;
  model: string;
  city08: number; // City MPG
  highway08: number; // Highway MPG
  comb08: number; // Combined MPG
  fuelType: string;
  fuelType1: string;
  cylinders?: number;
  displ?: number; // Engine displacement
  drive?: string;
  trany?: string; // Transmission
  VClass?: string; // Vehicle class
}

// Fetch available years
export async function getYears(): Promise<number[]> {
  try {
    const response = await fetch(`${BASE_URL}/vehicle/menu/year`, {
      headers: {
        'Accept': 'application/json',
      },
    });
    const data = await response.json();

    // The API returns an object with a menuItem array
    if (data.menuItem) {
      return data.menuItem.map((item: MenuYear) => parseInt(item.value));
    }
    return [];
  } catch (error) {
    console.error('Error fetching years:', error);
    return [];
  }
}

// Fetch makes for a given year
export async function getMakes(year: number): Promise<MenuMake[]> {
  try {
    const response = await fetch(`${BASE_URL}/vehicle/menu/make?year=${year}`, {
      headers: {
        'Accept': 'application/json',
      },
    });
    const data = await response.json();

    if (data.menuItem) {
      // API returns single object when there's only one item, convert to array
      return Array.isArray(data.menuItem) ? data.menuItem : [data.menuItem];
    }
    return [];
  } catch (error) {
    console.error('Error fetching makes:', error);
    return [];
  }
}

// Fetch models for a given year and make
export async function getModels(year: number, make: string): Promise<MenuModel[]> {
  try {
    const response = await fetch(`${BASE_URL}/vehicle/menu/model?year=${year}&make=${make}`, {
      headers: {
        'Accept': 'application/json',
      },
    });
    const data = await response.json();

    if (data.menuItem) {
      // API returns single object when there's only one item, convert to array
      return Array.isArray(data.menuItem) ? data.menuItem : [data.menuItem];
    }
    return [];
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
}

// Fetch vehicle options (specific configurations) for year, make, and model
export async function getVehicleOptions(year: number, make: string, model: string): Promise<VehicleOption[]> {
  try {
    const response = await fetch(
      `${BASE_URL}/vehicle/menu/options?year=${year}&make=${make}&model=${model}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );
    const data = await response.json();

    if (data.menuItem) {
      // API returns single object when there's only one item, convert to array
      return Array.isArray(data.menuItem) ? data.menuItem : [data.menuItem];
    }
    return [];
  } catch (error) {
    console.error('Error fetching vehicle options:', error);
    return [];
  }
}

// Fetch specific vehicle data by ID
export async function getVehicle(id: number): Promise<ApiVehicle | null> {
  try {
    const response = await fetch(`${BASE_URL}/vehicle/${id}`, {
      headers: {
        'Accept': 'application/json',
      },
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching vehicle:', error);
    return null;
  }
}

export interface FuelPrices {
  regular: string;
  midgrade: string;
  premium: string;
  diesel: string;
  e85: string;
  electric: string;
  cng: string;
  lpg: string;
}

// Fetch current national average fuel prices
export async function getFuelPrices(): Promise<FuelPrices | null> {
  try {
    const response = await fetch(`${BASE_URL}/fuelprices`, {
      headers: {
        'Accept': 'application/json',
      },
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching fuel prices:', error);
    return null;
  }
}
