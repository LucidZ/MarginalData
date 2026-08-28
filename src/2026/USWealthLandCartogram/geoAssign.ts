/**
 * Additively-weighted geodesic Voronoi assignment.
 *
 * Replaces the earlier path-based approach (land sorted by arc-length along
 * a single west-east line, cut into exact quota ranges), which was exact and
 * always-contiguous but read as vertical bands with no geographic logic.
 *
 * The model here: every group is a wavefront expanding at equal speed from
 * its own seed, through land only. Cell `c` belongs to group `i` when
 *
 *     score_i(c) = g(c, seed_i) - w_i
 *
 * is the smallest score at `c` AND is negative, where `g` is geodesic
 * distance *through the landmass* and `w_i` is that group's "radius budget".
 * A negative-score requirement means each group is literally a disc of
 * radius `w_i` grown from its seed and deformed by the coastline — land
 * outside every disc stays unclaimed, which is what lets the map show
 * partial states while only some groups have been placed. Fitting the `w_i`
 * (see fitWeights) so each group's cell count hits its exact wealth-share
 * quota is the whole algorithm.
 *
 * Two properties make this work where the previous two attempts didn't:
 *
 * 1. NO REGION CAN EVER SPLIT. Take any cell `x` owned by group `i` and walk
 *    the shortest land path back to seed_i. For any point `y` on that path,
 *    g(y, seed_i) = g(x, seed_i) - len(x..y) exactly, while the triangle
 *    inequality gives g(y, seed_j) >= g(x, seed_j) - len(x..y) for every
 *    other group. So score_i(y) - score_j(y) <= score_i(x) - score_j(x) <= 0:
 *    `y` is still won by `i`, and score_i(y) < score_i(x) < 0 keeps it inside
 *    the radius budget. Every cell has an unbroken same-colored path home,
 *    so each region is connected by construction — no repair pass needed.
 *    This argument only uses the triangle inequality and the prefix property
 *    of shortest paths, both of which hold *exactly* in the discrete grid
 *    metric we actually compute, so it isn't a continuous-space idealization.
 *
 *    The connectivity guarantee is specific to *additive* weights on
 *    distance. The abandoned attempt used Euclidean distance with power
 *    (squared) weights, which has neither property: its cells are convex, so
 *    intersecting them with a concave coastline splits regions across bays.
 *
 * 2. PLACEMENT ORDER DOESN'T MATTER. The solve is global — every click
 *    re-fits all weights from scratch — so the final partition depends only
 *    on where the seeds are, not the order they were placed in. A late seed
 *    dropped in Miami pushes whoever held Florida outward automatically:
 *    that group's own weight has to grow to keep its quota, so it expands
 *    somewhere else. No incremental pushing, no agent simulation, no jitter.
 */

import type { PersonDot } from "./personDots";

/**
 * Chamfer weights for 8-connected grid distance: 5 orthogonal / 7 diagonal
 * approximates true Euclidean distance to within ~2%, and keeping them
 * small integers is what lets the shortest-path search below use a bucket
 * queue (O(N)) instead of a binary heap (O(N log N)) — worth roughly a 4x
 * speedup on a ~900K-cell landmass, which matters because weight fitting
 * re-evaluates the whole grid dozens of times per click.
 */
const W_ORTHO = 5;
const W_DIAG = 7;
const BUCKET_COUNT = W_DIAG + 1;

export const DIST_INF = 0x7fffffff;

const NEI_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NEI_DY = [0, 0, 1, -1, 1, -1, 1, -1];
const NEI_W = [W_ORTHO, W_ORTHO, W_ORTHO, W_ORTHO, W_DIAG, W_DIAG, W_DIAG, W_DIAG];

/** Every land cell's index, ascending — the iteration set for every pass below. */
export function collectLandCells(land: Uint8Array): Int32Array {
  let count = 0;
  for (let i = 0; i < land.length; i++) if (land[i]) count++;
  const out = new Int32Array(count);
  let k = 0;
  for (let i = 0; i < land.length; i++) if (land[i]) out[k++] = i;
  return out;
}

/** Nearest land cell to a pixel — where a click actually plants its seed,
 *  since clicks land a pixel or two offshore all the time. */
export function nearestLandCell(landCells: Int32Array, width: number, px: number, py: number): number {
  let best = landCells[0];
  let bestD = Infinity;
  for (let r = 0; r < landCells.length; r++) {
    const cell = landCells[r];
    const dx = (cell % width) - px;
    const dy = ((cell / width) | 0) - py;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = cell;
    }
  }
  return best;
}

/**
 * Single-source geodesic distance from `source` to every land cell, via
 * Dial's algorithm: because every edge weight is 5 or 7, the priority queue
 * collapses to 8 circular buckets indexed by distance mod 8 — a settled
 * node can only ever relax neighbors into the next 7 distance values, so
 * they always land in a bucket that hasn't been processed yet. Entries are
 * never removed on decrease-key; a stale entry is recognized on pop because
 * its recorded distance no longer matches the bucket it came out of.
 *
 * This is the only expensive step per click, and it runs exactly once per
 * seed — App caches the field for every already-placed seed, so a click
 * costs one traversal no matter how many groups are already on the map.
 */
export function geodesicDistance(
  land: Uint8Array,
  width: number,
  height: number,
  source: number
): Int32Array {
  const dist = new Int32Array(land.length).fill(DIST_INF);
  if (!land[source]) return dist;

  const buckets: number[][] = Array.from({ length: BUCKET_COUNT }, () => []);
  dist[source] = 0;
  buckets[0].push(source);
  let pending = 1;
  let cur = 0;

  while (pending > 0) {
    const bucket = buckets[cur % BUCKET_COUNT];
    while (bucket.length > 0) {
      const idx = bucket.pop()!;
      pending--;
      if (dist[idx] !== cur) continue; // superseded by a shorter path already settled
      const x = idx % width;
      const y = (idx / width) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + NEI_DX[d];
        const ny = y + NEI_DY[d];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (!land[nIdx]) continue; // water is impassable: this is what bends the wave around coastline
        const nd = cur + NEI_W[d];
        if (nd < dist[nIdx]) {
          dist[nIdx] = nd;
          buckets[nd % BUCKET_COUNT].push(nIdx);
          pending++;
        }
      }
    }
    cur++;
  }
  return dist;
}

/**
 * Distance (in the same Chamfer units) within which a boundary is
 * considered "about to move" when estimating how fast a group's area grows
 * with its weight — 4 pixels' worth. Small enough that the estimate is
 * local, large enough that the count isn't dominated by raster noise.
 */
const SLOPE_PROBE = W_ORTHO * 4;

/** Fitting stops as soon as every group is exactly on quota, but that can
 *  stall a cell or two out on a step edge, so it also gives up after this
 *  many passes and hands the remainder to ditherToExact. */
const MAX_FIT_ITERATIONS = 60;
/** Damping on the Newton step. Under-relaxing keeps the coupled weights
 *  from ping-ponging (growing one group shrinks its neighbors, which the
 *  per-group derivative estimate doesn't account for). */
const FIT_DAMPING = 0.75;
/** Largest fraction of its current radius a group's weight may move in one
 *  iteration — see the cap in the fit loop for why this is needed. */
const MAX_STEP_FRACTION = 0.6;

interface EvalScratch {
  areas: Int32Array;
  /**
   * `lose[owner * 4 + challenger]`: how many cells currently held by `owner`
   * sit within one probe width of `challenger` taking them. Row 4 is
   * unclaimed land, which is why it has five rows and four columns —
   * unclaimed can be taken from, but it has no weight of its own to move.
   *
   * This is the whole Jacobian in raw form. Counting only the *diagonal* of
   * it (each group's own boundary) is not enough: when several groups are
   * short at once they are largely short of the *same* contested cells, so a
   * diagonal-only step has all of them advance onto ground the others also
   * claim, most of the movement cancels, and the fit crawls in at a few
   * percent per pass instead of converging.
   */
  lose: Int32Array;
}

/**
 * One full pass over the landmass: assigns every cell under the current
 * weights and tallies areas plus the two boundary counts used as the
 * derivative estimate. Unrolled to exactly four distance fields (the group
 * count is fixed at four) with unused slots aliased to field 0 and given a
 * hugely negative weight so they can never win — that keeps the hot loop
 * free of null checks and array-of-array indirection, which is worth real
 * time when this runs ~30x per click over ~900K cells.
 */
function evaluate(
  landCells: Int32Array,
  fields: Int32Array[],
  w: Float64Array,
  k: number,
  out: EvalScratch
): void {
  out.areas.fill(0);
  out.lose.fill(0);

  const NEVER = -1e15;
  const d0 = fields[0];
  const d1 = fields[1] ?? d0;
  const d2 = fields[2] ?? d0;
  const d3 = fields[3] ?? d0;
  const w0 = w[0];
  const w1 = k > 1 ? w[1] : NEVER;
  const w2 = k > 2 ? w[2] : NEVER;
  const w3 = k > 3 ? w[3] : NEVER;

  const { areas, lose } = out;

  for (let r = 0; r < landCells.length; r++) {
    const c = landCells[r];

    // The "unclaimed" option is just a virtual competitor sitting at score
    // 0 — that single trick is what enforces the radius budget, keeps the
    // partial-placement states working, and makes the boundary bookkeeping
    // below identical for group-vs-group and group-vs-empty edges.
    let best = -1;
    let bestScore = 0;

    const s0 = d0[c] - w0;
    if (s0 < bestScore) { bestScore = s0; best = 0; }

    const s1 = d1[c] - w1;
    if (s1 < bestScore) { bestScore = s1; best = 1; }

    const s2 = d2[c] - w2;
    if (s2 < bestScore) { bestScore = s2; best = 2; }

    const s3 = d3[c] - w3;
    if (s3 < bestScore) { bestScore = s3; best = 3; }

    if (best >= 0) areas[best]++;
    const row = (best < 0 ? 4 : best) * 4;
    if (s0 - bestScore < SLOPE_PROBE && best !== 0) lose[row]++;
    if (s1 - bestScore < SLOPE_PROBE && best !== 1) lose[row + 1]++;
    if (s2 - bestScore < SLOPE_PROBE && best !== 2) lose[row + 2]++;
    if (s3 - bestScore < SLOPE_PROBE && best !== 3) lose[row + 3]++;
  }
}

/** Writes the partition implied by `w` into `label` (-1 = unclaimed). Same
 *  argmin as `evaluate`, without the tallies — used once the fit is done. */
function assign(
  landCells: Int32Array,
  fields: Int32Array[],
  w: Float64Array,
  k: number,
  label: Int8Array
): void {
  label.fill(-1);
  for (let r = 0; r < landCells.length; r++) {
    const c = landCells[r];
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < k; i++) {
      const s = fields[i][c] - w[i];
      if (s < bestScore) { bestScore = s; best = i; }
    }
    label[c] = best;
  }
}

/**
 * Raises each weight to the minimum value that keeps that group's own seed
 * inside its own region: group `i` holds seed_i as long as
 * `-w_i <= g(seed_i, seed_j) - w_j` for every other group, i.e.
 * `w_i >= w_j - g(seed_i, seed_j)`.
 *
 * This is the "pinned seeds" rule, and expressing it as a floor on the
 * weight rather than as a hard override of one cell's label is what keeps it
 * safe: the result is still an honest additively-weighted geodesic diagram,
 * so the no-splitting guarantee above still holds. Force-flipping the seed
 * cell's label directly would instead have stranded a single pinned cell
 * inside someone else's territory — a one-cell island, exactly the artifact
 * the whole approach exists to avoid.
 *
 * In practice this floor is almost never the binding constraint at these
 * quota sizes; it only bites if two seeds are placed nearly on top of each
 * other, which is precisely when a group would otherwise get swallowed.
 */
function applyPinFloors(w: Float64Array, fields: Int32Array[], seedCells: number[], k: number): void {
  for (let i = 0; i < k; i++) {
    let floor = 1; // strictly positive so seed_i is inside i's own radius budget
    for (let j = 0; j < k; j++) {
      if (j === i) continue;
      const gap = fields[j][seedCells[i]];
      if (gap === DIST_INF) continue;
      const need = w[j] - gap + 1;
      if (need > floor) floor = need;
    }
    if (w[i] < floor) w[i] = floor;
  }
}

/**
 * Solves for the radius budgets that put every group exactly on quota.
 *
 * Area is monotone in the weights (raise w_i and group i can only grow,
 * everyone else can only shrink), and the problem is the dual of an optimal
 * transport problem, so it's concave and a damped Newton ascent converges
 * without any line search. The derivative estimate is geometric rather than
 * numerical: `gain[i] / SLOPE_PROBE` is roughly how many cells group i picks
 * up per unit of extra radius, since that's how many cells sit within one
 * probe-width of its boundary.
 *
 * Warm-starting from the previous click's weights (App keeps them) cuts this
 * to a handful of passes, because only the newly placed group's weight is
 * genuinely unknown.
 */
export function fitWeights(
  landCells: Int32Array,
  fields: Int32Array[],
  seedCells: number[],
  quotas: number[],
  previous?: Float64Array | null,
  trace?: number[]
): Float64Array {
  const k = quotas.length;
  const w = new Float64Array(4);
  for (let i = 0; i < k; i++) {
    // Cold start: the radius of a disc with the target area. Right order of
    // magnitude immediately, which matters because a wildly wrong start can
    // put a group's boundary somewhere the local derivative is useless.
    w[i] = previous && i < previous.length && previous[i] > 0
      ? previous[i]
      : W_ORTHO * Math.sqrt(quotas[i] / Math.PI);
  }

  const scratch: EvalScratch = { areas: new Int32Array(4), lose: new Int32Array(20) };
  const jac = new Float64Array(k * k);
  const rhs = new Float64Array(k);

  // Adaptive damping plus best-so-far. Seeds placed close together make the
  // distance fields nearly parallel, so `d_i - d_j` is almost constant over
  // the whole map and ownership flips globally on a tiny change in weight:
  // the Jacobian becomes enormous and ill-conditioned, and a plain Newton
  // step overshoots so hard the fit oscillates instead of converging. Backing
  // the step off whenever the error grows contains that, and returning the
  // best weights actually seen means a bad iteration can never be what the
  // caller gets handed.
  let damping = FIT_DAMPING;
  let prevWorst = Infinity;
  let bestWorst = Infinity;
  const best = Float64Array.from(w);

  for (let iter = 0; iter < MAX_FIT_ITERATIONS; iter++) {
    applyPinFloors(w, fields, seedCells, k);
    evaluate(landCells, fields, w, k, scratch);

    // Scored on the worst single group, not the total. Total misallocation
    // was tried and is much worse: it lets the fit settle on a state where
    // one group is enormously wrong while the others are slightly better,
    // which is exactly the state the clustered-seed cases fall into, and it
    // cost them tens of thousands of cells. Capping the worst group keeps
    // the degenerate cases usable at the price of a few stray cells in the
    // well-behaved ones.
    let worst = 0;
    for (let i = 0; i < k; i++) worst = Math.max(worst, Math.abs(quotas[i] - scratch.areas[i]));
    if (worst < bestWorst) {
      bestWorst = worst;
      best.set(w);
    }
    if (worst === 0) break;
    if (worst > prevWorst) damping = Math.max(damping * 0.5, 0.02);
    else damping = Math.min(damping * 1.3, FIT_DAMPING);
    prevWorst = worst;

    for (let i = 0; i < k; i++) rhs[i] = quotas[i] - scratch.areas[i];
    buildJacobian(scratch.lose, k, jac);
    solveInPlace(jac, rhs, k);

    for (let i = 0; i < k; i++) {
      let step = damping * rhs[i];
      // Cap per-iteration movement. Where a group is nowhere near winning the
      // cells it needs, its row of the Jacobian is nearly empty and the step
      // off it is wild; the cap keeps that from throwing the coupled system
      // rather than converging it.
      const cap = MAX_STEP_FRACTION * (w[i] + SLOPE_PROBE * 10);
      if (step > cap) step = cap;
      else if (step < -cap) step = -cap;
      if (!Number.isFinite(step)) step = 0;
      w[i] += step;
      if (w[i] < 1) w[i] = 1;
    }
    if (trace) trace.push(worst);
  }
  w.set(best);
  applyPinFloors(w, fields, seedCells, k);
  return w;
}

/**
 * Assembles d(area_i)/d(w_j) from the raw boundary counts.
 *
 * Growing w_i by one probe width pulls in every cell within a probe of group
 * i winning, wherever it currently sits — including unclaimed land, which is
 * what gives the "everyone is short at once" common mode a real derivative
 * instead of an accidental one. Every one of those cells is simultaneously a
 * loss for whoever holds it now, which is the off-diagonal term.
 */
function buildJacobian(lose: Int32Array, k: number, jac: Float64Array): void {
  jac.fill(0);
  for (let i = 0; i < k; i++) {
    let gain = 0;
    for (let owner = 0; owner < 5; owner++) {
      if (owner === i) continue;
      const cells = lose[owner * 4 + i];
      gain += cells;
      if (owner < k) jac[owner * k + i] -= cells / SLOPE_PROBE;
    }
    jac[i * k + i] += gain / SLOPE_PROBE;
  }
}

/**
 * Gaussian elimination with partial pivoting on the (at most 4x4) system,
 * writing the solution back over `rhs`. A small ridge is added to the
 * diagonal first: once every cell of land is claimed, adding the same amount
 * to all four weights changes nothing at all, so the matrix is exactly
 * singular in that direction and needs the nudge to stay invertible.
 */
function solveInPlace(jac: Float64Array, rhs: Float64Array, k: number): void {
  let maxDiag = 0;
  for (let i = 0; i < k; i++) maxDiag = Math.max(maxDiag, Math.abs(jac[i * k + i]));
  const ridge = 1e-3 * maxDiag + 1e-9;
  for (let i = 0; i < k; i++) jac[i * k + i] += ridge;

  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(jac[r * k + col]) > Math.abs(jac[pivot * k + col])) pivot = r;
    }
    if (pivot !== col) {
      for (let c = 0; c < k; c++) {
        const t = jac[col * k + c];
        jac[col * k + c] = jac[pivot * k + c];
        jac[pivot * k + c] = t;
      }
      const t = rhs[col];
      rhs[col] = rhs[pivot];
      rhs[pivot] = t;
    }
    const diag = jac[col * k + col];
    if (Math.abs(diag) < 1e-12) continue;
    for (let r = col + 1; r < k; r++) {
      const factor = jac[r * k + col] / diag;
      if (factor === 0) continue;
      for (let c = col; c < k; c++) jac[r * k + c] -= factor * jac[col * k + c];
      rhs[r] -= factor * rhs[col];
    }
  }
  for (let r = k - 1; r >= 0; r--) {
    let sum = rhs[r];
    for (let c = r + 1; c < k; c++) sum -= jac[r * k + c] * rhs[c];
    const diag = jac[r * k + r];
    rhs[r] = Math.abs(diag) < 1e-12 ? 0 : sum / diag;
  }
}

/**
 * Crossing-number test for whether cell `c` can leave `owner` without
 * locally pinching that region in two: walk the 8 neighbors in circular
 * order and count 0->1 transitions among those still owned by `owner`.
 * Exactly one transition means those neighbors form a single arc, so `c`
 * isn't the only thing joining two lobes and removing it is safe.
 *
 * Only the dither step needs this. The main solve can't create a split at
 * all (see the file header), but dithering deliberately moves a few cells
 * *against* the score ordering to close the last rounding gap, which puts it
 * outside that guarantee.
 */
const RING_DX = [1, 1, 0, -1, -1, -1, 0, 1];
const RING_DY = [0, -1, -1, -1, 0, 1, 1, 1];

function isSimplePoint(
  label: Int8Array,
  width: number,
  height: number,
  c: number,
  owner: number
): boolean {
  const x = c % width;
  const y = (c / width) | 0;
  const ring: number[] = [];
  for (let r = 0; r < 8; r++) {
    const nx = x + RING_DX[r];
    const ny = y + RING_DY[r];
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) ring.push(0);
    else ring.push(label[ny * width + nx] === owner ? 1 : 0);
  }
  let ones = 0;
  let transitions = 0;
  for (let r = 0; r < 8; r++) {
    if (ring[r]) ones++;
    if (!ring[r] && ring[(r + 1) % 8]) transitions++;
  }
  return ones > 0 && transitions === 1;
}

/**
 * Closes the last few cells of rounding error left by fitWeights.
 *
 * Area as a function of the weights is a step function, so with four coupled
 * groups it's not always possible to land all of them exactly on quota at
 * once — the fit typically ends within a few dozen cells out of ~900K
 * (well under 0.01%, invisible), but "each group's area is exactly its
 * wealth share" is the entire premise of the piece, so it's worth finishing
 * off properly rather than rounding in the caption.
 *
 * Cells are moved cheapest-first by score margin, only ever across an
 * existing border into an adjacent under-quota region (which keeps the
 * receiving region connected for free), and only when leaving doesn't pinch
 * the donor (isSimplePoint). Unclaimed land participates as group index `k`
 * with the leftover as its quota, so a partially-placed map balances the
 * same way — and it skips the pinch test, since leftover land is allowed to
 * be scattered.
 */
export function ditherToExact(
  label: Int8Array,
  land: Uint8Array,
  landCells: Int32Array,
  fields: Int32Array[],
  w: Float64Array,
  quotas: number[],
  seedCells: number[],
  width: number,
  height: number
): number[] {
  // A group's own seed is never tradeable. It needs saying explicitly,
  // because when a group is being squeezed its seed is the *first* cell
  // erosion would take, not the last: the squeeze means the weight floor
  // above is binding, the floor is exactly the condition that the seed is
  // held by the narrowest possible margin, and the transfers below go
  // cheapest-margin-first. Left unguarded, a squeezed group loses its seed
  // immediately and its territory reappears wherever the map happens to be
  // roomiest — a click on the Carolinas ending up as a blob in Indiana.
  const pinned = new Set(seedCells);
  const k = quotas.length;
  const target = [...quotas, landCells.length - quotas.reduce((a, b) => a + b, 0)];
  const areas = new Array<number>(k + 1).fill(0);

  /** Group holding a cell, with unclaimed land folded in as index k. */
  const ownerOf = (idx: number): number => {
    const l = label[idx];
    return l < 0 ? k : l;
  };
  for (let r = 0; r < landCells.length; r++) areas[ownerOf(landCells[r])]++;

  const scoreOf = (c: number, group: number): number =>
    group === k ? 0 : fields[group][c] - w[group];

  /**
   * Cost of moving cell `c` from one group to another, with a tie-break.
   *
   * The tie-break is not cosmetic. Distances are integers, so `score_to -
   * score_from` is constant across whole bands of the map wherever the two
   * distance fields run parallel — and when a transfer needs some but not
   * all of a tied band, insertion order decides which cells it takes, which
   * scatters them and produces the stipple. Ordering ties by distance from
   * the receiving group's own seed makes it consume a tied band as a
   * coherent front instead. The coefficient is small enough that it can only
   * ever separate exact ties, never reorder genuinely different costs.
   */
  const moveCost = (c: number, from: number, to: number): number =>
    scoreOf(c, to) - scoreOf(c, from) + (to === k ? 0 : 1e-6 * fields[to][c]);

  /**
   * Moves boundary cells cheapest-first from any group the caller counts as a
   * donor into any group it counts as a recipient, until the books balance.
   *
   * Frontier-driven rather than pass-driven: flipping a cell exposes its
   * neighbours as new candidates, which are pushed straight back onto the
   * heap. A fixed number of full sweeps would only ever peel one boundary
   * layer each, which is fine for the handful of cells the fit normally
   * leaves over but nowhere near enough for the squeezed case below, where a
   * group can need thousands of cells eroded off it.
   *
   * Both predicates read the live area tallies, so a transfer stops on its
   * own the moment the books balance. Recipients only ever gain cells they
   * already touch, which keeps them connected for free; donors are checked
   * for pinching first, except unclaimed land, which is allowed to scatter.
   */
  const runTransfer = (
    isDonor: (g: number) => boolean,
    isRecipient: (g: number) => boolean
  ): number => {
    const heap: { cell: number; from: number; to: number; cost: number }[] = [];
    const push = (m: { cell: number; from: number; to: number; cost: number }) => {
      heap.push(m);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent].cost <= heap[i].cost) break;
        const t = heap[parent];
        heap[parent] = heap[i];
        heap[i] = t;
        i = parent;
      }
    };
    const pop = () => {
      if (heap.length === 0) return undefined;
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let small = i;
          if (l < heap.length && heap[l].cost < heap[small].cost) small = l;
          if (r < heap.length && heap[r].cost < heap[small].cost) small = r;
          if (small === i) break;
          const t = heap[small];
          heap[small] = heap[i];
          heap[i] = t;
          i = small;
        }
      }
      return top;
    };

    const offer = (c: number) => {
      const from = ownerOf(c);
      if (!isDonor(from)) return;
      const x = c % width;
      const y = (c / width) | 0;
      let seen = 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + NEI_DX[d];
        const ny = y + NEI_DY[d];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (!land[nIdx]) continue; // ocean is not spare land to trade with
        const to = ownerOf(nIdx);
        if (to === from || (seen >> to) & 1) continue;
        seen |= 1 << to;
        if (!isRecipient(to)) continue;
        push({ cell: c, from, to, cost: moveCost(c, from, to) });
      }
    };

    for (let r = 0; r < landCells.length; r++) offer(landCells[r]);

    let moved = 0;
    for (;;) {
      const m = pop();
      if (!m) break;
      if (!isDonor(m.from) || !isRecipient(m.to)) continue;
      if (ownerOf(m.cell) !== m.from) continue; // stale: already moved
      if (m.from !== k && pinned.has(m.cell)) continue;
      if (m.from !== k && !isSimplePoint(label, width, height, m.cell, m.from)) continue;
      label[m.cell] = m.to === k ? -1 : m.to;
      areas[m.from]--;
      areas[m.to]++;
      moved++;
      const x = m.cell % width;
      const y = (m.cell / width) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + NEI_DX[d];
        const ny = y + NEI_DY[d];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (land[nIdx]) offer(nIdx);
      }
    }
    return moved;
  };

  // A relay pass deliberately makes the books look worse for a moment (the
  // relaying group goes short so the debt can move), so progress is tracked
  // against the best state seen rather than the previous pass, and the loop
  // gives up once a few passes in a row fail to beat it. Without that, two
  // groups can hand the same debt back and forth until the pass cap runs out.
  let bestOutstanding = Infinity;
  let stalled = 0;

  for (let pass = 0; pass < 16; pass++) {
    let outstanding = 0;
    for (let i = 0; i < k; i++) outstanding += Math.abs(target[i] - areas[i]);
    if (outstanding === 0) break;
    if (outstanding < bestOutstanding) {
      bestOutstanding = outstanding;
      stalled = 0;
    } else if (++stalled >= 3) break;

    // Two half-steps, and the order matters. Early on, the placed groups are
    // separate blobs with unclaimed land between them and share no border at
    // all, so a short group and a long group have no way to trade directly.
    // Unclaimed land is the buffer: the short group pulls from it first,
    // which drops it below its own target, and that in turn gives the long
    // group somewhere to shed into. Net movement of unclaimed land is zero,
    // and since the quotas sum to the whole landmass, driving every group to
    // its target puts unclaimed on target automatically.
    const absorbed = runTransfer(
      (g) => g === k || areas[g] > target[g],
      (g) => g < k && areas[g] < target[g]
    );
    const shed = runTransfer(
      (g) => g < k && areas[g] > target[g],
      (g) => g === k && areas[k] < target[k]
    );
    if (absorbed + shed > 0) continue;

    // Both half-steps stalled with the books still open, which means the
    // short group and the long group don't touch and there's no unclaimed
    // land left to pass cells through — the state the map ends in, where all
    // four groups are down and every cell is spoken for. Let a group that is
    // exactly on target hand cells to a short neighbour instead, going short
    // itself; on the next pass it takes them back off whoever is long. The
    // debt walks across the map one group at a time until it reaches the
    // group that actually owes it.
    //
    // Roles are snapshotted before the transfer runs, and the relaying group
    // is given a debt ceiling equal to the surplus actually outstanding.
    // Without the ceiling it would disqualify itself as a donor the instant
    // it went one cell under, so the debt could only ever advance one cell
    // per pass; without the snapshot the group it just paid would qualify as
    // a donor again and hand the cells straight back.
    // The budget counts unclaimed land's own surplus too. Leaving it out
    // left the relay disabled in exactly the case that needs it most — a
    // short group with the spare cells sitting in an unclaimed pocket that
    // only some *other*, on-target group touches. With no group over target,
    // the budget came out zero, every donor disqualified itself immediately,
    // and the pocket stayed stranded.
    let surplus = 0;
    const shortAtStart = new Uint8Array(k);
    for (let i = 0; i <= k; i++) {
      if (areas[i] > target[i]) surplus += areas[i] - target[i];
      else if (i < k && areas[i] < target[i]) shortAtStart[i] = 1;
    }
    const relayed = runTransfer(
      (g) => g < k && !shortAtStart[g] && areas[g] > target[g] - surplus,
      (g) => g < k && shortAtStart[g] === 1 && areas[g] < target[g]
    );
    if (relayed === 0) break;
  }

  return areas.slice(0, k);
}

export interface Partition {
  /** group index per cell; -1 for unclaimed land and for water */
  label: Int8Array;
  /** final cell count per group — equals the quota once dithering closes */
  areas: number[];
  quotas: number[];
  weights: Float64Array;
}

/** Full solve for one click: fit the radius budgets, paint the labels, then
 *  close the rounding gap. Distance fields are supplied by the caller so
 *  already-placed seeds don't get re-traversed. */
export function solvePartition(
  land: Uint8Array,
  landCells: Int32Array,
  fields: Int32Array[],
  seedCells: number[],
  quotas: number[],
  totalCells: number,
  width: number,
  height: number,
  previousWeights?: Float64Array | null,
  trace?: number[]
): Partition {
  const weights = fitWeights(landCells, fields, seedCells, quotas, previousWeights, trace);
  const label = new Int8Array(totalCells).fill(-1);
  assign(landCells, fields, weights, quotas.length, label);
  const areas = ditherToExact(
    label,
    land,
    landCells,
    fields,
    weights,
    quotas,
    seedCells,
    width,
    height
  );
  return { label, areas, quotas, weights };
}

/**
 * Places a group's person-dots inside its region, spread from the seed
 * outward: cells are ranked by geodesic distance from that group's own seed
 * and each dot takes the cell at its own fixed fractional depth.
 *
 * The ranking is done with a distance histogram plus prefix sums rather than
 * an actual sort — a region can hold several hundred thousand cells and this
 * runs for every group on every click, where a sort would dominate the whole
 * frame budget.
 *
 * Ranking by depth (rather than, say, raster order) is what keeps dots
 * stable: a dot holds the same *fractional* depth in its region, so when a
 * later seed pushes that region around, every dot slides proportionally
 * instead of being reshuffled. A group whose region didn't change gets
 * byte-identical cells back and doesn't move at all.
 */
export function pickDotCells(
  label: Int8Array,
  landCells: Int32Array,
  distField: Int32Array,
  groupIndex: number,
  fractions: Map<number, number>
): Map<number, number> {
  const out = new Map<number, number>();
  if (fractions.size === 0) return out;

  let maxDist = 0;
  let count = 0;
  for (let r = 0; r < landCells.length; r++) {
    const c = landCells[r];
    if (label[c] !== groupIndex) continue;
    count++;
    const d = distField[c];
    if (d !== DIST_INF && d > maxDist) maxDist = d;
  }
  if (count === 0) return out;

  const hist = new Int32Array(maxDist + 2);
  for (let r = 0; r < landCells.length; r++) {
    const c = landCells[r];
    if (label[c] !== groupIndex) continue;
    const d = distField[c];
    hist[d === DIST_INF ? maxDist + 1 : d]++;
  }
  const cursor = new Int32Array(hist.length);
  let running = 0;
  for (let d = 0; d < hist.length; d++) {
    cursor[d] = running;
    running += hist[d];
  }

  // rank -> dot id, so the second pass can recognize its targets in O(1)
  const wanted = new Map<number, number>();
  fractions.forEach((frac, id) => {
    wanted.set(Math.min(count - 1, Math.max(0, Math.floor(frac * count))), id);
  });

  for (let r = 0; r < landCells.length; r++) {
    const c = landCells[r];
    if (label[c] !== groupIndex) continue;
    const d = distField[c];
    const rank = cursor[d === DIST_INF ? maxDist + 1 : d]++;
    const id = wanted.get(rank);
    if (id !== undefined) {
      out.set(id, c);
      if (out.size === wanted.size) break;
    }
  }
  return out;
}

/** Convenience: the dots of one group, as {id -> fractional depth}. */
export function dotDepthFractions(dots: PersonDot[], groupIndex: number): Map<number, number> {
  const groupDots = dots.filter((d) => d.groupIndex === groupIndex);
  const out = new Map<number, number>();
  for (const dot of groupDots) {
    out.set(dot.id, slotFraction(dot, groupDots.length));
  }
  return out;
}

/** Same slot-plus-jitter scheme the path version used, just expressed as a
 *  fraction of the region's depth range instead of a fraction of a 1D
 *  path range. See personDots.ts for why slots are ordered center-out. */
function slotFraction(dot: PersonDot, groupSize: number): number {
  const JITTER_AMPLITUDE = 0.8;
  const jitter = (hash01(dot.id) - 0.5) * JITTER_AMPLITUDE;
  return (dot.regionSlot + 0.5 + jitter) / groupSize;
}

function hash01(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
