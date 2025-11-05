import "./App.css";
import { useState, useEffect } from "react";
import {
  getYears,
  getMakes,
  getModels,
  getVehicleOptions,
  getVehicle,
  type MenuMake,
  type MenuModel,
  type VehicleOption,
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

  // Load years on mount
  useEffect(() => {
    loadYears();
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
                      <label>City MPG:</label>
                      <span>{vehicle.mpgCity}</span>
                    </div>
                    <div className="mpg-stat">
                      <label>Highway MPG:</label>
                      <span>{vehicle.mpgHighway}</span>
                    </div>
                    <div className="mpg-stat">
                      <label>Combined MPG:</label>
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
