import "./App.css";
import { useState, useEffect } from "react";
import { scaleLinear, max, format } from "d3";
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
  type ApiVehicle,
} from "../FuelEconomyTool/api";
import {
  DEFAULT_VEHICLES,
  CATEGORY_COLORS,
  CATEGORY_NAMES,
  type VehicleCategory,
} from "./defaultVehicles";

interface PlotVehicle {
  id: number;
  make: string;
  model: string;
  year: number;
  mpgCombined: number;
  annualCost: number;
  fuelType: string;
  category?: VehicleCategory;
}

function App() {
  const [vehicles, setVehicles] = useState<PlotVehicle[]>([]);
  const [fuelPrices, setFuelPrices] = useState<FuelPrices | null>(null);
  const [hoveredVehicle, setHoveredVehicle] = useState<PlotVehicle | null>(null);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(true);

  // Chart dimensions
  const width = 960;
  const height = 500;
  const margin = { top: 20, right: 30, bottom: 65, left: 90 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Vehicle selector state
  const [years, setYears] = useState<number[]>([]);
  const [makes, setMakes] = useState<MenuMake[]>([]);
  const [models, setModels] = useState<MenuModel[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);

  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMake, setSelectedMake] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedOption, setSelectedOption] = useState<string>("");

  const [isLoadingYears, setIsLoadingYears] = useState(true);
  const [isLoadingMakes, setIsLoadingMakes] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const annualMiles = 12000;

  useEffect(() => {
    loadYears();
    loadFuelPrices();
  }, []);

  // Load default vehicles after fuel prices are loaded
  useEffect(() => {
    if (fuelPrices) {
      loadDefaultVehicles();
    }
  }, [fuelPrices]);

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

  useEffect(() => {
    if (selectedYear && selectedMake) {
      setSelectedModel("");
      setSelectedOption("");
      setModels([]);
      setVehicleOptions([]);
      loadModels(parseInt(selectedYear), selectedMake);
    }
  }, [selectedYear, selectedMake]);

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
    setYears(yearList.sort((a, b) => b - a));
    setIsLoadingYears(false);
  }

  async function loadFuelPrices() {
    const prices = await getFuelPrices();
    setFuelPrices(prices);
  }

  async function loadDefaultVehicles() {
    setIsLoadingDefaults(true);
    const loadedVehicles: PlotVehicle[] = [];

    for (const defaultVehicle of DEFAULT_VEHICLES) {
      try {
        const vehicleData = await getVehicle(defaultVehicle.id);
        if (vehicleData) {
          const plotVehicle = convertApiVehicleToPlotVehicle(vehicleData);
          if (plotVehicle) {
            plotVehicle.category = defaultVehicle.category;
            loadedVehicles.push(plotVehicle);
          }
        }
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.warn(`Failed to load default vehicle ${defaultVehicle.id}:`, error);
      }
    }

    setVehicles(loadedVehicles);
    setIsLoadingDefaults(false);
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

  function isElectricVehicle(fuelType: string): boolean {
    const lowerFuel = fuelType.toLowerCase();
    return lowerFuel.includes("electric") || lowerFuel.includes("electricity");
  }

  function getFuelPriceForType(fuelType: string): number {
    if (!fuelPrices) return 0;

    const lowerFuel = fuelType.toLowerCase();
    if (lowerFuel.includes("electric")) return parseFloat(fuelPrices.electric);
    if (lowerFuel.includes("premium")) return parseFloat(fuelPrices.premium);
    if (lowerFuel.includes("diesel")) return parseFloat(fuelPrices.diesel);
    if (lowerFuel.includes("e85")) return parseFloat(fuelPrices.e85);
    return parseFloat(fuelPrices.regular);
  }

  function calculateAnnualCost(mpgCombined: number, fuelType: string): number {
    const price = getFuelPriceForType(fuelType);

    if (isElectricVehicle(fuelType)) {
      const kwhPer100Miles = (33.7 / mpgCombined) * 100;
      const kwhPerYear = (annualMiles / 100) * kwhPer100Miles;
      return kwhPerYear * price;
    } else {
      const gallonsPerYear = annualMiles / mpgCombined;
      return gallonsPerYear * price;
    }
  }

  function convertApiVehicleToPlotVehicle(
    vehicle: ApiVehicle
  ): PlotVehicle | null {
    try {
      const fuelType = vehicle.fuelType1 || vehicle.fuelType || "Regular";
      const mpgCombined = Number(vehicle.comb08);

      if (!mpgCombined || mpgCombined <= 0 || !isFinite(mpgCombined)) {
        return null;
      }

      const annualCost = calculateAnnualCost(mpgCombined, fuelType);

      if (!isFinite(annualCost) || annualCost < 0) {
        return null;
      }

      return {
        id: vehicle.id,
        make: vehicle.make || "Unknown",
        model: vehicle.model || "Unknown",
        year: vehicle.year,
        mpgCombined,
        annualCost,
        fuelType,
      };
    } catch (error) {
      console.error("Error converting vehicle data:", vehicle.id, error);
      return null;
    }
  }

  async function handleAddVehicle() {
    if (!selectedOption) {
      alert("Please select a vehicle configuration");
      return;
    }

    setIsSearching(true);
    try {
      const vehicleId = parseInt(selectedOption);
      const vehicleData = await getVehicle(vehicleId);

      if (vehicleData) {
        const plotVehicle = convertApiVehicleToPlotVehicle(vehicleData);

        if (plotVehicle) {
          if (!vehicles.find((v) => v.id === plotVehicle.id)) {
            setVehicles([...vehicles, plotVehicle]);
          } else {
            alert("This vehicle is already on the plot");
          }
        } else {
          alert("Unable to add this vehicle - invalid data");
        }
      } else {
        alert("Vehicle not found");
      }
    } catch (error) {
      console.error("Error adding vehicle:", error);
      alert("Error adding vehicle to plot");
    }

    setIsSearching(false);
  }

  function handleRemoveVehicle(id: number) {
    setVehicles(vehicles.filter((v) => v.id !== id));
  }

  // Create scales
  const maxMpg = max(vehicles, (d) => d.mpgCombined) || 100;
  const xScale = scaleLinear()
    .domain([0, maxMpg])
    .range([0, innerWidth])
    .nice();

  const yScale = scaleLinear()
    .domain([0, (max(vehicles, (d) => d.annualCost) || 3000) + 200])
    .range([innerHeight, 0])
    .nice();

  const xAxisTickFormat = format(".0f");
  const yAxisTickFormat = format("$,.0f");

  return (
    <div className="fuel-economy-curve-app">
      <header className="project-header">
        <h1>Fuel Economy Curve</h1>
        <p className="project-description">
          Explore the relationship between fuel efficiency and annual fuel costs
          (based on 12,000 miles per year). Add vehicles to see how they compare.
        </p>
      </header>

      <main className="curve-container">
        <section className="vehicle-selector-section">
          <h2>Add Vehicle to Plot</h2>
          <div className="selector-controls">
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
              className="add-button"
              onClick={handleAddVehicle}
              disabled={!selectedOption || isSearching}
            >
              {isSearching ? "Adding..." : "Add to Plot"}
            </button>
          </div>
        </section>

        <section className="chart-section">
          <h2>MPG vs Annual Fuel Cost</h2>
          {isLoadingDefaults ? (
            <div className="empty-chart">
              <p>Loading default vehicles...</p>
            </div>
          ) : vehicles.length === 0 ? (
            <div className="empty-chart">
              <p>Add vehicles using the selector above to see them plotted here.</p>
            </div>
          ) : (
            <div className="chart-wrapper">
              <svg width={width} height={height}>
                <g transform={`translate(${margin.left},${margin.top})`}>
                  {/* Grid lines */}
                  <g className="grid">
                    {yScale.ticks(5).map((tick) => (
                      <line
                        key={`y-grid-${tick}`}
                        x1={0}
                        x2={innerWidth}
                        y1={yScale(tick)}
                        y2={yScale(tick)}
                        stroke="#e0e0e0"
                        strokeDasharray="2,2"
                      />
                    ))}
                    {xScale.ticks(10).map((tick) => (
                      <line
                        key={`x-grid-${tick}`}
                        x1={xScale(tick)}
                        x2={xScale(tick)}
                        y1={0}
                        y2={innerHeight}
                        stroke="#e0e0e0"
                        strokeDasharray="2,2"
                      />
                    ))}
                  </g>

                  {/* X Axis */}
                  <g transform={`translate(0,${innerHeight})`}>
                    <line x1={0} x2={innerWidth} stroke="black" />
                    {xScale.ticks(10).map((tick) => (
                      <g key={tick} transform={`translate(${xScale(tick)},0)`}>
                        <line y2={6} stroke="black" />
                        <text
                          y={20}
                          textAnchor="middle"
                          fontSize="12"
                          fill="#666"
                        >
                          {xAxisTickFormat(tick)}
                        </text>
                      </g>
                    ))}
                    <text
                      x={innerWidth / 2}
                      y={50}
                      textAnchor="middle"
                      fontSize="14"
                      fill="#333"
                    >
                      Combined MPG / MPGe
                    </text>
                  </g>

                  {/* Y Axis */}
                  <g>
                    <line y1={0} y2={innerHeight} stroke="black" />
                    {yScale.ticks(5).map((tick) => (
                      <g key={tick} transform={`translate(0,${yScale(tick)})`}>
                        <line x2={-6} stroke="black" />
                        <text
                          x={-10}
                          textAnchor="end"
                          alignmentBaseline="middle"
                          fontSize="12"
                          fill="#666"
                        >
                          {yAxisTickFormat(tick)}
                        </text>
                      </g>
                    ))}
                    <text
                      transform={`translate(-60,${innerHeight / 2}) rotate(-90)`}
                      textAnchor="middle"
                      fontSize="14"
                      fill="#333"
                    >
                      Annual Fuel Cost
                    </text>
                  </g>

                  {/* Data points */}
                  {vehicles.map((vehicle) => (
                    <circle
                      key={vehicle.id}
                      cx={xScale(vehicle.mpgCombined)}
                      cy={yScale(vehicle.annualCost)}
                      r={hoveredVehicle?.id === vehicle.id ? 8 : 6}
                      fill={vehicle.category ? CATEGORY_COLORS[vehicle.category] : "#3498db"}
                      opacity={0.7}
                      stroke="#2c3e50"
                      strokeWidth={hoveredVehicle?.id === vehicle.id ? 2 : 1}
                      onMouseEnter={() => setHoveredVehicle(vehicle)}
                      onMouseLeave={() => setHoveredVehicle(null)}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
                </g>
              </svg>

              {/* Tooltip */}
              {hoveredVehicle && (
                <div className="custom-tooltip" style={{ display: "block" }}>
                  <p className="tooltip-title">
                    {hoveredVehicle.year} {hoveredVehicle.make}{" "}
                    {hoveredVehicle.model}
                  </p>
                  <p className="tooltip-detail">
                    <strong>MPG:</strong> {hoveredVehicle.mpgCombined}
                  </p>
                  <p className="tooltip-detail">
                    <strong>Annual Cost:</strong> $
                    {hoveredVehicle.annualCost.toFixed(0)}
                  </p>
                  <p className="tooltip-detail">
                    <strong>Fuel Type:</strong> {hoveredVehicle.fuelType}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          {vehicles.length > 0 && (
            <div className="chart-legend">
              {(Object.keys(CATEGORY_COLORS) as VehicleCategory[]).map((category) => (
                <div key={category} className="legend-item">
                  <div
                    className="legend-color"
                    style={{ backgroundColor: CATEGORY_COLORS[category] }}
                  />
                  <span>{CATEGORY_NAMES[category]}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {vehicles.length > 0 && (
          <section className="custom-vehicles-list">
            <h2>Vehicles on Plot ({vehicles.length})</h2>
            <div className="vehicles-grid">
              {vehicles.map((vehicle) => (
                <div key={vehicle.id} className="vehicle-chip">
                  <span className="vehicle-name">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </span>
                  <button
                    className="remove-chip-button"
                    onClick={() => handleRemoveVehicle(vehicle.id)}
                    title="Remove vehicle"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
