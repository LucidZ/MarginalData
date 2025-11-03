import "./App.css";
import { useState } from "react";

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
  const [comparisonData, setComparisonData] = useState<ComparisonData>({
    vehicles: [],
    isLoading: false,
    error: null,
  });

  const [selectedVehicles, setSelectedVehicles] = useState<VehicleData[]>([]);

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
            <p>Vehicle search interface will go here...</p>
            <div className="search-controls">
              <input
                type="text"
                placeholder="Search by make, model, or year..."
                className="vehicle-search-input"
              />
              <button className="search-button">Search</button>
            </div>
          </div>
        </section>

        {selectedVehicles.length > 0 && (
          <section className="comparison-results">
            <h2>Vehicle Comparison</h2>
            <div className="comparison-grid">
              {selectedVehicles.map((vehicle) => (
                <div key={vehicle.id} className="vehicle-card">
                  <h3>
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </h3>
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
