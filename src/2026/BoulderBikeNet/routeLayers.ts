// "Your route" mode: draggable A/B pins and the route drawn by street class.
import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Geometry, LineString } from "geojson";
import type { BikeGraph, LatLng, PlanMask, Routes } from "./routing";
import type { ProfileId } from "./types";
import { CLASS_COLOR, CLASS_LABEL, REC_COLOR } from "./style";
import type { Inspect } from "./networkLayers";

const pinIcon = (txt: string, fill: string) =>
  L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div class="bbn-pin" style="background:${fill}">${txt}</div>`,
  });

export const PIN_COLORS = ["#2b8a3e", "#111"];

/** Route endpoints: A and B, either may be unset. */
export type Slots = [LatLng | null, LatLng | null];

export function usePins(map: L.Map | null, pins: Slots, movePin: (i: number, ll: LatLng, done: boolean) => void, active: boolean) {
  const markers = useRef<(L.Marker | null)[]>([null, null]);
  const move = useRef(movePin);
  move.current = movePin;
  const hasA = !!pins[0], hasB = !!pins[1];

  // (Re)create a marker when its slot is filled or emptied
  useEffect(() => {
    if (!map || !active) return;
    const ms = ([0, 1] as const).map((i) => {
      const p = i === 0 ? hasA : hasB;
      if (!p) return null;
      const m = L.marker([0, 0], { draggable: true, icon: pinIcon(i ? "B" : "A", PIN_COLORS[i]), keyboard: false, zIndexOffset: 1000 });
      let raf = 0;
      const at = (): LatLng => [m.getLatLng().lat, m.getLatLng().lng];
      m.on("drag", () => {
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; move.current(i, at(), false); });
      });
      m.on("dragend", () => move.current(i, at(), true));
      return m;
    });
    markers.current = ms;
    return () => {
      for (const m of ms) m?.remove();
      markers.current = [null, null];
    };
  }, [map, active, hasA, hasB]);

  // Keep marker positions in sync with state
  useEffect(() => {
    if (!map) return;
    markers.current.forEach((m, i) => {
      const p = pins[i];
      if (!m || !p) return;
      const ll = m.getLatLng();
      if (ll.lat !== p[0] || ll.lng !== p[1]) m.setLatLng(p);
      if (!map.hasLayer(m)) m.addTo(map);
    });
  }, [map, pins, hasA, hasB, active]);
}

export function useRouteLayers(
  map: L.Map | null,
  graph: BikeGraph | null,
  routes: Routes | null,
  profile: ProfileId,
  ghosts: boolean,
  pins: Slots,
  active: boolean,
  onInspect: Inspect,
  plan?: PlanMask, // routes were found with the plan built
  today?: Routes | null, // with a plan: the same ride on today's network, drawn as the ghost
  planGeoms?: Geometry[] | null, // with a plan: its recommendations, faint context
) {
  const inspect = useRef(onInspect);
  inspect.current = onInspect;

  // The plan's links, under everything else
  useEffect(() => {
    if (!map || !active || !planGeoms) return;
    const l = L.geoJSON({ type: "GeometryCollection", geometries: planGeoms } as Geometry, {
      style: { color: REC_COLOR, weight: 3, opacity: 0.35 },
      interactive: false,
    }).addTo(map);
    return () => {
      l.remove();
    };
  }, [map, active, planGeoms]);

  useEffect(() => {
    if (!map || !graph || !routes || !active) return;
    const R = routes.byProfile[profile];
    if (!R) return;
    const group = L.layerGroup().addTo(map);
    const ghost = (steps: number[], color: string) =>
      L.polyline(steps.map((r) => graph.edgeCoords(r)), { color, weight: 2.5, opacity: 0.55, dashArray: "2 6", interactive: false }).addTo(group);
    if (ghosts && plan) {
      const T = today?.byProfile[profile];
      if (T) ghost(T.steps, "#111").setStyle({ weight: 3, opacity: 0.75 }).bindTooltip("Today's route");
    } else if (ghosts)
      for (const [p, x] of Object.entries(routes.byProfile)) if (p !== profile && x) ghost(x.steps, "#444");
    // White casing, then one polyline per run of the same class (clickable for photos)
    L.polyline(R.steps.map((r) => graph.edgeCoords(r)), { color: "#fff", weight: 10, opacity: 0.9, interactive: false }).addTo(group);
    let run: LatLng[] = [];
    let cls: string | null = null;
    const flush = () => {
      if (!run.length || !cls) return;
      const isNew = cls === "new", pts = run;
      const label = isNew ? "New protected link (the plan)" : CLASS_LABEL[cls as keyof typeof CLASS_LABEL];
      const line = L.polyline(pts, { color: isNew ? REC_COLOR : CLASS_COLOR[cls as keyof typeof CLASS_COLOR], weight: 6, opacity: 0.95 }).addTo(group);
      line.bindTooltip(label, { sticky: true });
      line.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        const geom: LineString = { type: "LineString", coordinates: pts.map(([la, ln]) => [ln, la]) };
        inspect.current(geom, e.latlng.lat, e.latlng.lng, `Your route: ${label.toLowerCase()}`);
      });
    };
    for (const r of R.steps) {
      const c = graph.isNew(r, plan) ? "new" : graph.classOf(r, plan), pts = graph.edgeCoords(r);
      if (c !== cls) {
        flush();
        run = [pts[0]];
        cls = c;
      }
      run.push(...pts.slice(1));
    }
    flush();
    // Dashed hop from each pin to where it snapped onto the street graph
    [routes.s, routes.t].forEach((n, i) => {
      const p = pins[i];
      if (p) L.polyline([p, graph.nodeLatLng(n)], { color: "#111", weight: 1.5, dashArray: "3 4", interactive: false }).addTo(group);
    });
    return () => {
      group.remove();
    };
  }, [map, graph, routes, profile, ghosts, pins, active, plan, today]);
}
