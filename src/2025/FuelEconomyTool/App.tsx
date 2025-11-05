import "./App.css";
import { useState, useEffect } from "react";
import {
  getYears,
  getMakes,
  getModels,
  getVehicleOptions,
  getVehicle,
  getFuelPrices,
  type MenuMake,
  type MenuModel,
  type VehicleOption,
  type FuelPrices,
} from "./api";

// Types for vehicle data
export interface VehicleData {
  id: string;
  make: string;
  model: string;
  year: number;
  mpgCity: number;
  mpgHighway: number;
  mpgCombined: number;
  fuelType: string;
  engine: string;
}

export interface ComparisonData {
  vehicles: VehicleData[];
  isLoading: boolean;
  error: string | null;
}

function App() {
  const [selectedVehicles, setSelectedVehicles] = useState<VehicleData[]>([]);

  // Search form state
  const [years, setYears] = useState<number[]>([]);
  const [makes, setMakes] = useState<MenuMake[]>([]);
  const [models, setModels] = useState<MenuModel[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);

  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMake, setSelectedMake] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedOption, setSelectedOption] = useState<string>("");

  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingYears, setIsLoadingYears] = useState(true);
  const [isLoadingMakes, setIsLoadingMakes] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  // Fuel prices state
  const [fuelPrices, setFuelPrices] = useState<FuelPrices | null>(null);
  const [customPrices, setCustomPrices] = useState<Partial<FuelPrices>>({});
  const [annualMiles, setAnnualMiles] = useState<number>(12000); // Default 12,000 miles/year

  // Load years and fuel prices on mount
  useEffect(() => {
    loadYears();
    loadFuelPrices();
  }, []);

  // Load makes when year changes
  useEffect(() => {
    if (selectedYear) {
      setSelectedMake("");
      setSelectedModel("");
      setSelectedOption("");
      setMakes([]);
      setModels([]);
      setVehicleOptions([]);
      loadMakes(parseInt(selectedYear));
    }
  }, [selectedYear]);

  // Load models when make changes
  useEffect(() => {
    if (selectedYear && selectedMake) {
      setSelectedModel("");
      setSelectedOption("");
      setModels([]);
      setVehicleOptions([]);
      loadModels(parseInt(selectedYear), selectedMake);
    }
  }, [selectedYear, selectedMake]);

  // Load vehicle options when model changes
  useEffect(() => {
    if (selectedYear && selectedMake && selectedModel) {
      setSelectedOption("");
      setVehicleOptions([]);
      loadVehicleOptions(parseInt(selectedYear), selectedMake, selectedModel);
    }
  }, [selectedYear, selectedMake, selectedModel]);

  async function loadYears() {
    setIsLoadingYears(true);
    const yearList = await getYears();
    setYears(yearList.sort((a, b) => b - a)); // Sort descending
    setIsLoadingYears(false);
  }

  async function loadFuelPrices() {
    const prices = await getFuelPrices();
    setFuelPrices(prices);
  }

  async function loadMakes(year: number) {
    setIsLoadingMakes(true);
    const makeList = await getMakes(year);
    setMakes(makeList);
    setIsLoadingMakes(false);
  }

  async function loadModels(year: number, make: string) {
    setIsLoadingModels(true);
    const modelList = await getModels(year, make);
    setModels(modelList);
    setIsLoadingModels(false);
  }

  async function loadVehicleOptions(year: number, make: string, model: string) {
    setIsLoadingOptions(true);
    const options = await getVehicleOptions(year, make, model);
    setVehicleOptions(options);
    setIsLoadingOptions(false);
  }

  async function handleAddVehicle() {
    if (!selectedOption) {
      alert("Please select a vehicle configuration");
      return;
    }

    setIsSearching(true);
    const vehicleId = parseInt(selectedOption);
    const vehicleData = await getVehicle(vehicleId);

    if (vehicleData) {
      // Convert API vehicle to our VehicleData format
      const newVehicle: VehicleData = {
        id: vehicleData.id.toString(),
        make: vehicleData.make,
        model: vehicleData.model,
        year: vehicleData.year,
        mpgCity: vehicleData.city08,
        mpgHighway: vehicleData.highway08,
        mpgCombined: vehicleData.comb08,
        fuelType: vehicleData.fuelType1 || vehicleData.fuelType,
        engine: `${vehicleData.displ || "N/A"}L ${vehicleData.cylinders || "N/A"}-cyl`,
      };

      // Check if vehicle is already in the list
      if (!selectedVehicles.find((v) => v.id === newVehicle.id)) {
        setSelectedVehicles([...selectedVehicles, newVehicle]);
      } else {
        alert("This vehicle is already in your comparison");
      }
    }

    setIsSearching(false);
  }

  function handleRemoveVehicle(id: string) {
    setSelectedVehicles(selectedVehicles.filter((v) => v.id !== id));
  }

  // Check if a vehicle is electric
  function isElectricVehicle(fuelType: string): boolean {
    const lowerFuel = fuelType.toLowerCase();
    return lowerFuel.includes("electric") || lowerFuel.includes("electricity");
  }

  // Get the correct efficiency unit (MPG or MPGe)
  function getEfficiencyUnit(fuelType: string): string {
    return isElectricVehicle(fuelType) ? "MPGe" : "MPG";
  }

  // Map vehicle fuel type to price key
  function getFuelPriceKey(fuelType: string): keyof FuelPrices {
    const lowerFuel = fuelType.toLowerCase();
    if (lowerFuel.includes("premium")) return "premium";
    if (lowerFuel.includes("midgrade") || lowerFuel.includes("mid-grade"))
      return "midgrade";
    if (lowerFuel.includes("diesel")) return "diesel";
    if (lowerFuel.includes("e85")) return "e85";
    if (lowerFuel.includes("electric") || lowerFuel.includes("electricity"))
      return "electric";
    if (lowerFuel.includes("cng")) return "cng";
    if (lowerFuel.includes("lpg")) return "lpg";
    return "regular"; // Default to regular
  }

  // Get the effective price for a fuel type (custom or default)
  function getEffectivePrice(fuelType: string): number {
    const priceKey = getFuelPriceKey(fuelType);
    const customPrice = customPrices[priceKey];
    if (customPrice) return parseFloat(customPrice);
    if (fuelPrices) return parseFloat(fuelPrices[priceKey]);
    return 0;
  }

  // Calculate annual fuel cost
  function calculateAnnualCost(vehicle: VehicleData): number {
    if (isElectricVehicle(vehicle.fuelType)) {
      // For EVs: MPGe represents equivalent energy, convert to kWh
      // 1 gallon of gas = 33.7 kWh (EPA standard)
      const pricePerKwh = getEffectivePrice(vehicle.fuelType);
      const kwhPer100Miles = 33.7 / vehicle.mpgCombined * 100;
      const kwhPerYear = (annualMiles / 100) * kwhPer100Miles;
      return kwhPerYear * pricePerKwh;
    } else {
      const pricePerGallon = getEffectivePrice(vehicle.fuelType);
      const gallonsPerYear = annualMiles / vehicle.mpgCombined;
      return gallonsPerYear * pricePerGallon;
    }
  }

  // Calculate cost per mile
  function calculateCostPerMile(vehicle: VehicleData): number {
    if (isElectricVehicle(vehicle.fuelType)) {
      // For EVs: convert MPGe to kWh per mile
      const pricePerKwh = getEffectivePrice(vehicle.fuelType);
      const kwhPerMile = 33.7 / vehicle.mpgCombined;
      return kwhPerMile * pricePerKwh;
    } else {
      const pricePerGallon = getEffectivePrice(vehicle.fuelType);
      return pricePerGallon / vehicle.mpgCombined;
    }
  }

  // Update a custom fuel price
  function handlePriceChange(priceKey: keyof FuelPrices, value: string) {
    setCustomPrices({
      ...customPrices,
      [priceKey]: value,
    });
  }

  return (
    <div className="fuel-economy-app">
      <header className="project-header">
        <h1>Fuel Economy Comparison Tool</h1>
        <p className="project-description">
          Compare the fuel efficiency of different vehicles using data from
          public APIs. Select vehicles to see how they stack up in terms of
          city, highway, and combined MPG.
        </p>
      </header>

      <main className="comparison-container">
        {fuelPrices && (
          <section className="gas-prices-section">
            <h2>Gas Prices & Settings</h2>
            <div className="gas-prices-grid">
              <div className="price-input-group">
                <label>Regular Gas</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={fuelPrices.regular}
                  value={customPrices.regular || ""}
                  onChange={(e) => handlePriceChange("regular", e.target.value)}
                  className="price-input"
                />
                <span className="price-hint">
                  ${customPrices.regular || fuelPrices.regular}/gal
                </span>
              </div>

              <div className="price-input-group">
                <label>Premium Gas</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={fuelPrices.premium}
                  value={customPrices.premium || ""}
                  onChange={(e) => handlePriceChange("premium", e.target.value)}
                  className="price-input"
                />
                <span className="price-hint">
                  ${customPrices.premium || fuelPrices.premium}/gal
                </span>
              </div>

              <div className="price-input-group">
                <label>Diesel</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={fuelPrices.diesel}
                  value={customPrices.diesel || ""}
                  onChange={(e) => handlePriceChange("diesel", e.target.value)}
                  className="price-input"
                />
                <span className="price-hint">
                  ${customPrices.diesel || fuelPrices.diesel}/gal
                </span>
              </div>

              <div className="price-input-group">
                <label>Electricity</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={fuelPrices.electric}
                  value={customPrices.electric || ""}
                  onChange={(e) => handlePriceChange("electric", e.target.value)}
                  className="price-input"
                />
                <span className="price-hint">
                  ${customPrices.electric || fuelPrices.electric}/kWh
                </span>
              </div>

              <div className="price-input-group">
                <label>Annual Miles</label>
                <input
                  type="number"
                  step="1000"
                  value={annualMiles}
                  onChange={(e) =>
                    setAnnualMiles(parseInt(e.target.value) || 12000)
                  }
                  className="price-input"
                />
                <span className="price-hint">{annualMiles.toLocaleString()} mi/yr</span>
              </div>
            </div>
            <p className="gas-prices-note">
              National average prices shown. Edit any field to use your local prices.
            </p>
          </section>
        )}

        <section className="vehicle-search">
          <h2>Search for Vehicles</h2>
          <div className="search-interface">
            <p>Select a vehicle to add to your comparison:</p>
            <div className="search-controls">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="vehicle-select"
                disabled={isLoadingYears}
              >
                <option value="">
                  {isLoadingYears ? "Loading years..." : "Select Year"}
                </option>
                {years?.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <select
                value={selectedMake}
                onChange={(e) => setSelectedMake(e.target.value)}
                className="vehicle-select"
                disabled={!selectedYear || isLoadingMakes}
              >
                <option value="">
                  {isLoadingMakes ? "Loading makes..." : "Select Make"}
                </option>
                {makes?.map((make) => (
                  <option key={make.value} value={make.value}>
                    {make.text}
                  </option>
                ))}
              </select>

              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="vehicle-select"
                disabled={!selectedMake || isLoadingModels}
              >
                <option value="">
                  {isLoadingModels ? "Loading models..." : "Select Model"}
                </option>
                {models?.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.text}
                  </option>
                ))}
              </select>

              <select
                value={selectedOption}
                onChange={(e) => setSelectedOption(e.target.value)}
                className="vehicle-select"
                disabled={!selectedModel || isLoadingOptions}
              >
                <option value="">
                  {isLoadingOptions
                    ? "Loading configurations..."
                    : "Select Configuration"}
                </option>
                {vehicleOptions?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.text}
                  </option>
                ))}
              </select>

              <button
                className="search-button"
                onClick={handleAddVehicle}
                disabled={!selectedOption || isSearching}
              >
                {isSearching ? "Adding..." : "Add Vehicle"}
              </button>
            </div>
          </div>
        </section>

        {selectedVehicles.length > 0 && (
          <section className="comparison-results">
            <h2>Vehicle Comparison</h2>
            <div className="comparison-grid">
              {selectedVehicles.map((vehicle) => (
                <div key={vehicle.id} className="vehicle-card">
                  <div className="vehicle-card-header">
                    <h3>
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </h3>
                    <button
                      className="remove-button"
                      onClick={() => handleRemoveVehicle(vehicle.id)}
                      title="Remove vehicle"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mpg-stats">
                    <div className="mpg-stat">
                      <label>City {getEfficiencyUnit(vehicle.fuelType)}:</label>
                      <span>{vehicle.mpgCity}</span>
                    </div>
                    <div className="mpg-stat">
                      <label>Highway {getEfficiencyUnit(vehicle.fuelType)}:</label>
                      <span>{vehicle.mpgHighway}</span>
                    </div>
                    <div className="mpg-stat">
                      <label>Combined {getEfficiencyUnit(vehicle.fuelType)}:</label>
                      <span>{vehicle.mpgCombined}</span>
                    </div>
                  </div>
                  <div className="vehicle-details">
                    <p>
                      <strong>Fuel Type:</strong> {vehicle.fuelType}
                    </p>
                    <p>
                      <strong>Engine:</strong> {vehicle.engine}
                    </p>
                  </div>

                  {fuelPrices && (
                    <div className="cost-stats">
                      <div className="cost-stat">
                        <label>
                          {isElectricVehicle(vehicle.fuelType)
                            ? "Electricity Price:"
                            : "Fuel Price:"}
                        </label>
                        <span>
                          ${getEffectivePrice(vehicle.fuelType).toFixed(2)}
                          {isElectricVehicle(vehicle.fuelType) ? "/kWh" : "/gal"}
                        </span>
                      </div>
                      <div className="cost-stat">
                        <label>Cost per Mile:</label>
                        <span>
                          ${calculateCostPerMile(vehicle).toFixed(3)}
                        </span>
                      </div>
                      <div className="cost-stat-highlight">
                        <label>Annual {isElectricVehicle(vehicle.fuelType) ? "Electricity" : "Fuel"} Cost:</label>
                        <span className="cost-amount">
                          ${calculateAnnualCost(vehicle).toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                      <p className="cost-note">
                        Based on {annualMiles.toLocaleString()} miles/year
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {selectedVehicles.length === 0 && (
          <section className="empty-state">
            <p>
              Search for vehicles above to start comparing their fuel economy.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
