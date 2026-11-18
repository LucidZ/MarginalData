// Client-side bike routing on the packed street graph (graph.json). Ported from the
// commute prototype in scripts/boulder_bikenet/build_commute_proto.py; results match
// route_test.py. Nothing leaves the browser.
import type { BikeClass, GraphData, ProfileId } from "./types";

const LAT0 = 40.015;
const MX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const MY = 110540;
const CELL = 200; // snap grid, metres

export type LatLng = [number, number];

export interface RouteResult {
  steps: number[]; // edge ids, negated-1 when traversed b -> a
  m: number;
  by: Record<BikeClass, number>;
  via: string[];
}

export interface Routes {
  s: number;
  t: number;
  byProfile: Partial<Record<ProfileId, RouteResult>>;
}

export class BikeGraph {
  readonly D: GraphData;
  readonly N: number;
  readonly E: number;
  private X: Float64Array;
  private Y: Float64Array;
  readonly EA: Int32Array;
  readonly EB: Int32Array;
  readonly ELEN: Float64Array;
  readonly ECLS: Uint8Array;
  private EART: Uint8Array;
  readonly EMIXED: Uint8Array;
  private ENAME: Int32Array;
  private deg: Int32Array;
  private ADJ: Int32Array;
  private costs: Record<string, Float64Array> = {};
  private grid = new Map<number, number[]>();
  // A* scratch, reused across searches
  private G: Float64Array;
  private PREV: Int32Array;
  private SEEN: Int32Array;
  private stamp = 0;

  constructor(D: GraphData) {
    this.D = D;
    const N = (this.N = D.xy.length / 2);
    const E = (this.E = D.e.length / 5);
    this.X = new Float64Array(N);
    this.Y = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      this.X[i] = (D.xy[2 * i] / 1e6) * MX;
      this.Y[i] = (D.xy[2 * i + 1] / 1e6) * MY;
    }
    this.EA = new Int32Array(E);
    this.EB = new Int32Array(E);
    this.ELEN = new Float64Array(E);
    this.ECLS = new Uint8Array(E);
    this.EART = new Uint8Array(E);
    this.EMIXED = new Uint8Array(E);
    this.ENAME = new Int32Array(E);
    const deg = (this.deg = new Int32Array(N + 1));
    const ow = new Uint8Array(E);
    for (let k = 0; k < E; k++) {
      const a = D.e[5 * k], b = D.e[5 * k + 1], f = D.e[5 * k + 3];
      this.EA[k] = a;
      this.EB[k] = b;
      this.ELEN[k] = D.e[5 * k + 2] / 10;
      this.ECLS[k] = f & 7;
      this.EART[k] = (f >> 3) & 1;
      this.EMIXED[k] = (f >> 6) & 1;
      this.ENAME[k] = D.e[5 * k + 4];
      ow[k] = (f >> 4) & 3; // 1: a->b only, 2: b->a only
      if (ow[k] !== 2) deg[a + 1]++;
      if (ow[k] !== 1) deg[b + 1]++;
    }
    for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
    this.ADJ = new Int32Array(deg[N]);
    const fill = deg.slice(0, N);
    for (let k = 0; k < E; k++) {
      if (ow[k] !== 2) this.ADJ[fill[this.EA[k]]++] = k;
      if (ow[k] !== 1) this.ADJ[fill[this.EB[k]]++] = -k - 1;
    }
    for (const p of Object.keys(D.profiles)) {
      const m = D.profiles[p as ProfileId], c = new Float64Array(E);
      for (let k = 0; k < E; k++) {
        const cls = D.classes[this.ECLS[k]];
        c[k] = this.ELEN[k] * m[cls === "painted" && this.EART[k] ? "arterial_painted" : cls];
      }
      this.costs[p] = c;
    }
    for (let i = 0; i < N; i++) {
      const key = this.cellKey(Math.floor(this.X[i] / CELL), Math.floor(this.Y[i] / CELL));
      const list = this.grid.get(key);
      if (list) list.push(i);
      else this.grid.set(key, [i]);
    }
    this.G = new Float64Array(N);
    this.PREV = new Int32Array(N);
    this.SEEN = new Int32Array(N);
  }

  private cellKey(cx: number, cy: number) {
    return cx * 100000 + cy;
  }

  /** Nearest graph node to a lat/lng, or -1. */
  snap([lat, lng]: LatLng): number {
    const x = lng * MX, y = lat * MY, cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    let best = -1, bd = Infinity;
    for (let r = 0; r < 15 && (best < 0 || (r - 1) * CELL < bd); r++)
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          for (const i of this.grid.get(this.cellKey(cx + dx, cy + dy)) ?? []) {
            const d = Math.hypot(this.X[i] - x, this.Y[i] - y);
            if (d < bd) {
              bd = d;
              best = i;
            }
          }
        }
    return best;
  }

  /** Metres from a lat/lng to its nearest graph node (Infinity if none nearby). */
  snapDistance(ll: LatLng): number {
    const i = this.snap(ll);
    return i < 0 ? Infinity : Math.hypot(this.X[i] - ll[1] * MX, this.Y[i] - ll[0] * MY);
  }

  // A*: multipliers are >= 1 and edges are at least as long as the straight line, so
  // straight-line distance is an admissible heuristic.
  private astar(s: number, t: number, cost: Float64Array): number[] | null {
    const { X, Y, G, PREV, SEEN, deg, ADJ, EA, EB } = this;
    const stamp = ++this.stamp;
    const hk: number[] = [], hv: number[] = []; // binary heap of (f, node), lazy deletion
    const push = (f: number, v: number) => {
      let i = hk.length;
      hk.push(f);
      hv.push(v);
      while (i) {
        const p = (i - 1) >> 1;
        if (hk[p] <= f) break;
        hk[i] = hk[p];
        hv[i] = hv[p];
        i = p;
      }
      hk[i] = f;
      hv[i] = v;
    };
    const pop = () => {
      const v = hv[0], lk = hk.pop()!, lv = hv.pop()!, n = hk.length;
      if (n) {
        let i = 0;
        for (;;) {
          let m = 2 * i + 1;
          if (m >= n) break;
          if (m + 1 < n && hk[m + 1] < hk[m]) m++;
          if (hk[m] >= lk) break;
          hk[i] = hk[m];
          hv[i] = hv[m];
          i = m;
        }
        hk[i] = lk;
        hv[i] = lv;
      }
      return v;
    };
    const h = (v: number) => 0.999 * Math.hypot(X[v] - X[t], Y[v] - Y[t]);
    SEEN[s] = stamp;
    G[s] = 0;
    PREV[s] = 0;
    push(h(s), s);
    const done = new Uint8Array(this.N);
    while (hk.length) {
      const u = pop();
      if (done[u]) continue;
      done[u] = 1;
      if (u === t) break;
      for (let j = deg[u]; j < deg[u + 1]; j++) {
        const r = ADJ[j], k = r >= 0 ? r : -r - 1, v = r >= 0 ? EB[k] : EA[k];
        const g = G[u] + cost[k];
        if (SEEN[v] !== stamp || g < G[v]) {
          SEEN[v] = stamp;
          G[v] = g;
          PREV[v] = r;
          push(g + h(v), v);
        }
      }
    }
    if (SEEN[t] !== stamp) return null;
    const steps: number[] = [];
    for (let v = t; v !== s; ) {
      const r = PREV[v], k = r >= 0 ? r : -r - 1;
      steps.push(r);
      v = r >= 0 ? EA[k] : EB[k];
    }
    return steps.reverse();
  }

  private summarize(steps: number[]): RouteResult {
    const by = Object.fromEntries(this.D.classes.map((c) => [c, 0])) as Record<BikeClass, number>;
    const names: Record<string, number> = {};
    let m = 0;
    for (const r of steps) {
      const k = r >= 0 ? r : -r - 1, len = this.ELEN[k];
      m += len;
      by[this.D.classes[this.ECLS[k]]] += len;
      const nm = this.D.names[this.ENAME[k]];
      if (nm) names[nm] = (names[nm] ?? 0) + len;
    }
    const via = Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
    return { steps, m, by, via };
  }

  route(a: LatLng, b: LatLng): Routes | null {
    const s = this.snap(a), t = this.snap(b);
    if (s < 0 || t < 0 || s === t) return null;
    const byProfile: Routes["byProfile"] = {};
    for (const p of Object.keys(this.D.profiles) as ProfileId[]) {
      const steps = this.astar(s, t, this.costs[p]);
      if (steps) byProfile[p] = this.summarize(steps);
    }
    return { s, t, byProfile };
  }

  nodeLatLng(i: number): LatLng {
    return [this.D.xy[2 * i + 1] / 1e6, this.D.xy[2 * i] / 1e6];
  }

  /** [lat, lng] points along an edge in traversal direction. */
  edgeCoords(r: number): LatLng[] {
    const k = r >= 0 ? r : -r - 1, { so, sp } = this.D;
    const pts: LatLng[] = [this.nodeLatLng(this.EA[k])];
    for (let j = so[k]; j < so[k + 1]; j++) pts.push([sp[2 * j + 1] / 1e6, sp[2 * j] / 1e6]);
    pts.push(this.nodeLatLng(this.EB[k]));
    return r >= 0 ? pts : pts.reverse();
  }

  classOf(r: number): BikeClass {
    const k = r >= 0 ? r : -r - 1;
    return this.D.classes[this.ECLS[k]];
  }
}
