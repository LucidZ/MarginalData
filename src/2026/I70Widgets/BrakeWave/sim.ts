// One-lane car-following simulation, no drawing. Each lane is an open road:
// cars arrive upstream at the lane's own steady rate and leave past the far end.
// Lanes don't interact and nobody passes. Every driver follows the same rules,
// so a lane's flow and speed come out of the run rather than going in.
//
// Drivers follow the IDM+ model (Schakel et al. 2010), the Intelligent Driver
// Model with min() in place of the sum, so a car settles at exactly its following
// gap instead of hanging back when it's near its desired speed. They act on what
// they decided a reaction time ago, as in the Human Driver Model (Treiber et al.
// 2006), and now and then tap the brakes for no reason.
import { CAR_M, MPS_PER_MPH } from "../lanes";

export const DT = 0.05;
export const MIN_GAP_M = 2; // bumper to bumper, stopped
export const TAP_S = 1;
export const BRAKE_LIMIT = 8; // m/s², the most tires can do
export const MAX_REACTION_S = 2;
const PLAN_STEPS = Math.round(MAX_REACTION_S / DT) + 1;

export const VIEW_M = 2400;
const UPSTREAM_M = 1500; // cars settle here before they come into view
const DOWNSTREAM_M = 400; // and keep following here after they leave it
export const ROAD_M = UPSTREAM_M + VIEW_M + DOWNSTREAM_M;
export const VIEW_START_M = UPSTREAM_M;
export const COUNTER_M = VIEW_START_M + VIEW_M / 2;
export const RATE_WINDOW_S = 180;
export const SLOWEST_WINDOW_S = 120;

export type Levers = {
  desiredMph: number; // average desired speed
  spreadMph: number; // drivers range this far either side of it
  gapS: number; // following gap, bumper to bumper
  reactionS: number;
  accel: number; // m/s²
  decel: number; // m/s², comfortable braking
  tapsPerHour: number; // random taps, per driver
  tapMph: number; // speed one tap sheds
};

export const DEFAULT_LEVERS: Levers = {
  desiredMph: 55,
  spreadMph: 5,
  gapS: 1.5,
  reactionS: 0.9,
  accel: 1,
  decel: 2,
  tapsPerHour: 2,
  tapMph: 6,
};

export type Car = {
  x: number; // front bumper, m along the road
  v: number;
  a: number;
  temper: number; // -1..1, where this driver sits in the desired-speed spread
  tapUntil: number; // sim time this driver's foot leaves the brake
  plan: Float32Array; // recent decisions, oldest gets acted on
};

export type Lane = {
  secPerCar: number;
  cars: Car[]; // front of the road first
  nextArrival: number;
  crossings: number[]; // times cars passed the counter, last RATE_WINDOW_S
  slowestBySec: number[]; // lowest speed in view each sim second
  lastContact: number; // sim time a car last reached the bumper ahead
};

export type Sim = {
  t: number;
  tick: number;
  levers: Levers;
  lanes: Lane[];
  rand: () => number;
};

// mulberry32, so a restart replays the same drivers.
function makeRand(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

const newCar = (sim: Sim, x: number, v: number): Car => ({
  x,
  v,
  a: 0,
  temper: sim.rand() * 2 - 1,
  tapUntil: -1,
  plan: new Float32Array(PLAN_STEPS),
});

export function createSim(secPerCar: number[], levers: Levers, seed = 7, warmupS = RATE_WINDOW_S + 240): Sim {
  const sim: Sim = { t: 0, tick: 0, levers, lanes: [], rand: makeRand(seed) };
  const cruise = levers.desiredMph * MPS_PER_MPH;
  sim.lanes = secPerCar.map((s) => {
    const lane: Lane = { secPerCar: s, cars: [], nextArrival: 0, crossings: [], slowestBySec: [], lastContact: -Infinity };
    const spacing = Math.max(cruise * s, CAR_M + MIN_GAP_M + cruise * levers.gapS);
    for (let x = ROAD_M - sim.rand() * spacing; x > 0; x -= spacing) {
      lane.cars.push(newCar(sim, x, cruise));
    }
    return lane;
  });
  for (let i = 0; i < warmupS / DT; i++) step(sim);
  return sim;
}

function decide(car: Car, lead: Car | undefined, l: Levers) {
  const desired = (l.desiredMph + car.temper * l.spreadMph) * MPS_PER_MPH;
  const free = 1 - (car.v / desired) ** 4;
  if (!lead) return l.accel * free;
  const gap = Math.max(lead.x - CAR_M - car.x, 0.1);
  const closing = car.v - lead.v;
  const wanted = MIN_GAP_M + Math.max(0, car.v * l.gapS + (car.v * closing) / (2 * Math.sqrt(l.accel * l.decel)));
  return l.accel * Math.min(free, 1 - (wanted / gap) ** 2);
}

export function step(sim: Sim) {
  const { t, tick, levers: l } = sim;
  const delay = Math.round(l.reactionS / DT);
  const tapChance = (l.tapsPerHour / 3600) * DT;
  const newSecond = Math.floor(t) !== Math.floor(t - DT) || tick === 0;
  for (const lane of sim.lanes) {
    const { cars } = lane;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (t >= car.tapUntil && sim.rand() < tapChance) car.tapUntil = t + TAP_S;
      car.plan[tick % PLAN_STEPS] = decide(car, cars[i - 1], l);
      car.a =
        t < car.tapUntil
          ? -(l.tapMph * MPS_PER_MPH) / TAP_S
          : car.plan[(tick - delay + PLAN_STEPS * 2) % PLAN_STEPS];
      car.a = Math.max(car.a, -BRAKE_LIMIT);
    }
    if (newSecond) {
      lane.slowestBySec.push(Infinity);
      if (lane.slowestBySec.length > SLOWEST_WINDOW_S) lane.slowestBySec.shift();
    }
    const bin = lane.slowestBySec.length - 1;
    // Front to back, so each car moves against its leader's new position.
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const v = Math.max(0, car.v + car.a * DT);
      const before = car.x;
      car.x += (car.v + v) * 0.5 * DT;
      car.v = v;
      if (before < COUNTER_M && car.x >= COUNTER_M) lane.crossings.push(t);
      if (car.x > VIEW_START_M && car.x < VIEW_START_M + VIEW_M && v < lane.slowestBySec[bin]) {
        lane.slowestBySec[bin] = v;
      }
      const lead = cars[i - 1];
      if (lead && car.x > lead.x - CAR_M) {
        lane.lastContact = t;
        car.x = lead.x - CAR_M;
        car.v = Math.min(car.v, lead.v);
      }
    }
    while (cars.length && cars[0].x > ROAD_M) cars.shift();
    while (lane.crossings.length && lane.crossings[0] < t - RATE_WINDOW_S) lane.crossings.shift();
    if (t >= lane.nextArrival) {
      const last = cars[cars.length - 1];
      const v = Math.min(l.desiredMph * MPS_PER_MPH, last ? last.v : Infinity);
      // Whoever can't get on yet takes the first room there is; arrivals don't stack up.
      if (!last || last.x - CAR_M > MIN_GAP_M + v * l.gapS) {
        cars.push(newCar(sim, 0, v));
        lane.nextArrival = t + lane.secPerCar;
      }
    }
  }
  sim.t += DT;
  sim.tick++;
}

// One driver taps the brakes.
export function tap(sim: Sim, laneIndex: number, carIndex: number) {
  const car = sim.lanes[laneIndex].cars[carIndex];
  if (car) car.tapUntil = sim.t + TAP_S;
}

// The car nearest position x in a lane.
export function nearestCar(lane: Lane, x: number) {
  let best = -1;
  let bestDist = Infinity;
  lane.cars.forEach((car, i) => {
    const d = Math.abs(car.x - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

export const carsPerHour = (lane: Lane) => (lane.crossings.length / RATE_WINDOW_S) * 3600;
export const slowest = (lane: Lane) => Math.min(...lane.slowestBySec);

// The model has no last-ditch swerve or look-ahead, so extreme settings put cars
// through each other. That's the model failing, not a crash to read anything into.
export const CONTACT_WINDOW_S = 60;
export const hasContacts = (sim: Sim) =>
  sim.lanes.some((lane) => lane.lastContact > sim.t - CONTACT_WINDOW_S);

// Speeds on the visible stretch right now.
export function averageSpeed(lane: Lane) {
  let sum = 0;
  let n = 0;
  for (const car of lane.cars) {
    if (car.x > VIEW_START_M && car.x < VIEW_START_M + VIEW_M) {
      sum += car.v;
      n++;
    }
  }
  return n ? sum / n : NaN;
}
