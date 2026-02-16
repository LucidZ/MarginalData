# Space Traveler - Expanse-Style Brachistochrone Trajectory Simulator

## Overview
A realistic space travel simulator inspired by The Expanse series, calculating brachistochrone trajectories between planets with constant acceleration and deceleration ("flip and burn").

## Physics Implementation

### Orbital Velocities
The spacecraft inherits the orbital velocity of its departure planet. This is calculated using the `astronomy-engine` library by computing the planet's position change over a 1-hour period.

**Typical orbital velocities:**
- Earth: ~30 km/s
- Mars: ~24 km/s
- Jupiter: ~13 km/s

### Velocity Components
The simulation tracks two velocity components:

1. **Thrust Velocity**: The velocity gained from the spacecraft's constant acceleration/deceleration
   - Starts at 0
   - Increases linearly during acceleration phase: v = a * t
   - Decreases linearly during deceleration phase: v = v_max - a * t

2. **Total Velocity**: The spacecraft's total velocity relative to the Sun
   - Total = Orbital Velocity (vector) + Thrust Velocity (vector)
   - This is the "true" speed through space

### Brachistochrone Trajectory
The spacecraft travels in a straight line from the departure planet's current position to where the destination planet will be at arrival time.

**Calculation method:**
1. Start with initial planet positions
2. Estimate travel time based on straight-line distance
3. Calculate where destination planet will be at that time
4. Recalculate travel time with new distance
5. Iterate until convergence (typically 5-10 iterations)

**Physics formulas:**
- Distance during constant acceleration: d = 0.5 * a * t²
- Total time (symmetric accel/decel): t = 2 * sqrt(d / a)
- Max velocity at flip point: v_max = a * (t / 2)

### Acceleration Profile
- **Phase 1 (0 to t/2)**: Constant acceleration toward destination
- **Flip point (t/2)**: Spacecraft rotates 180°
- **Phase 2 (t/2 to t)**: Constant deceleration

The flip point is marked with a red dot on the visualization.

## Features

### Visualization
- Real-time planetary positions using ephemeris data
- All 8 planets with accurate orbital paths
- Auto-zoom to fit journey
- Color-coded spacecraft (green = accelerating, orange = decelerating)
- 1 AU scale indicator

### Controls
- Planet selection (all 8 planets)
- Acceleration: 0.1G to 5.0G
- Animation speed: 1x to 100x
- Play/Pause/Reset controls

### Statistics Display
- Total journey duration (days + hours)
- Distance (AU and million km)
- Max velocity at flip point
- **Current velocity (total)**: Includes orbital velocity
- **Thrust velocity**: From acceleration only
- Velocity as percentage of speed of light
- Current date and arrival date
- Elapsed and remaining time

## Example Journeys

### Earth to Mars at 1G
- Distance: ~0.5 AU (typical)
- Duration: ~20-40 days depending on planetary alignment
- Max velocity: ~100,000+ km/h
- Initial velocity: ~30 km/s (Earth's orbital velocity)

### Earth to Jupiter at 1G
- Distance: ~4-6 AU
- Duration: ~100-150 days
- Max velocity: ~300,000+ km/h
- Much longer due to greater distance

## Technical Notes

- Uses `astronomy-engine` for planetary positions
- Canvas-based rendering for smooth animation
- Heliocentric coordinate system (Sun at origin)
- 2D projection (ignores z-axis for simplification)
- Iteration tolerance: 0.01 days (~14 minutes)

## Future Enhancements
- Add more celestial bodies (dwarf planets, asteroids)
- Show delta-v requirements
- Add fuel consumption calculations
- Multiple spacecraft comparison
- Custom start dates
- Realistic orbital insertion at destination
