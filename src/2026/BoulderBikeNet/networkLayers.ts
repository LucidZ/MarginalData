// "The network" mode: one BikeNetKit recommendation set at a time plus the input layers, drawn
// on the shared Leaflet map. Ported from scripts/boulder_bikenet/build_preview_map.py.
import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Feature, Geometry } from "geojson";
import type { NetworkData, ToolId, ToolProps, VersionId } from "./types";
import { ACCENT, COMMUTE_COLOR, CRASH_COLOR, CLASS_COLOR, TOOLS, toolTitle, toolTooltip } from "./style";

export interface NetworkView {
  version: VersionId;
  tool: ToolId;
  diff: boolean; // highlight changes vs v1 (other versions only)
  km: number; // Grow: first N km of build order
  layers: { protected: boolean; painted: boolean; crashes: boolean; commutes: boolean };
}

export type Inspect = (geom: Geometry, lat: number, lng: number, title: string) => void;

/** One recommendation, with its 1-based position in build order. */
export interface Pick {
  tool: ToolId;
  p: ToolProps;
  rank: number;
}

export const isGrow = (t: ToolId) => t === "grow" || t === "grow_existing";

/** A version's recommendations for one tool, in build order. */
export function toolFeatures(data: NetworkData, v: VersionId, tool: ToolId): ToolProps[] {
  return [...(data.tools[v][tool]?.features ?? [])].sort((a, b) => a.ordering - b.ordering);
}

export function inBudget(tool: ToolId, p: ToolProps, km: number): boolean {
  if (!("length_cumulative" in p) || !isGrow(tool)) return true;
  return p.length_cumulative - p.length < km * 1000;
}

export const featureKey = (p: ToolProps) => ("key" in p ? p.key : `g${p.g}`);

/** Is this version's output compared against v1 on the map? */
export function showsDiff(data: NetworkData, view: NetworkView) {
  return view.diff && view.version !== "v1" && view.tool !== "link" && data.differs[view.version].includes(view.tool);
}

export function useNetworkLayers(
  map: L.Map | null,
  data: NetworkData | null,
  view: NetworkView,
  selected: number | null, // geometry index of the highlighted recommendation
  active: boolean,
  onInspect: Inspect,
  onSelect: (pick: Pick) => void,
) {
  const cb = useRef({ onInspect, onSelect });
  cb.current = { onInspect, onSelect };

  // Input layers, built once per dataset
  const inputs = useRef<Record<string, L.GeoJSON> | null>(null);
  useEffect(() => {
    if (!map || !data) return;
    const click = (title: string) => (f: Feature, l: L.Layer) => {
      l.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        cb.current.onInspect(f.geometry, e.latlng.lat, e.latlng.lng, title);
      });
    };
    const maxW = Math.max(...data.commutes.features.map((f) => f.properties.workers));
    const built: Record<string, L.GeoJSON> = {
      protected: L.geoJSON(data.protected, { style: { color: CLASS_COLOR.protected, weight: 2.2, opacity: 0.7 }, interactive: false }),
      protected_v0: L.geoJSON(data.protected_v0, { style: { color: CLASS_COLOR.protected, weight: 2.2, opacity: 0.7 }, interactive: false }),
      painted: L.geoJSON(data.painted, {
        style: { color: CLASS_COLOR.painted, weight: 2, opacity: 0.8 },
        onEachFeature: (f, l) => {
          const t = `Painted lane${f.properties.name ? ": " + f.properties.name : ""}`;
          l.bindTooltip(t, { sticky: true });
          click(t)(f, l);
        },
      }),
      crashes: L.geoJSON(data.crashes, {
        pointToLayer: (_f, ll) => L.circleMarker(ll, { radius: 3.5, color: "#fff", weight: 0.8, fillColor: CRASH_COLOR, fillOpacity: 0.85 }),
        onEachFeature: (f, l) => {
          const p = f.properties, t = `Bike crash ${p.year}${p.severity ? ", " + p.severity.toLowerCase() : ""}`;
          l.bindTooltip(t);
          click(t)(f, l);
        },
      }),
      commutes: L.geoJSON(data.commutes, {
        style: (f) => ({ color: COMMUTE_COLOR, weight: 0.6 + (5 * (f?.properties.workers ?? 0)) / maxW, opacity: 0.35 }),
        onEachFeature: (f, l) => l.bindTooltip(`${f.properties.workers} workers commute between these areas`, { sticky: true }),
      }),
    };
    inputs.current = built;
    return () => {
      for (const l of Object.values(built)) l.remove();
      inputs.current = null;
    };
  }, [map, data]);

  // Recommendations + input visibility
  useEffect(() => {
    if (!map || !data || !inputs.current) return;
    const ins = inputs.current;
    const group = L.featureGroup().addTo(map);
    if (active) {
      const t = view.tool;
      const all = toolFeatures(data, view.version, t);
      const feats = all.filter((p) => inBudget(t, p, view.km));
      const changed = showsDiff(data, view);
      const base = changed ? new Set(toolFeatures(data, "v1", t).filter((p) => inBudget(t, p, view.km)).map(featureKey)) : null;
      const n = Math.max(1, feats.length);
      const dim = selected !== null;
      feats.forEach((p, i) => {
        const isNew = !!base && !base.has(featureKey(p));
        const isSel = p.g === selected;
        const geom = data.geoms[p.g];
        if (isSel) L.geoJSON(geom, { style: { color: "#111", weight: 11, opacity: 0.9 }, interactive: false }).addTo(group);
        const line = L.geoJSON(geom, {
          style: {
            color: isNew ? ACCENT : TOOLS[t].color,
            weight: isSel ? 6 : (isNew ? 6 : 5) - (3 * i) / n,
            opacity: isSel ? 1 : dim ? 0.3 : changed && !isNew ? 0.45 : 0.95,
          },
        });
        line.bindTooltip((isNew ? "<b>New vs v1</b><br>" : "") + toolTooltip(t, p, i + 1), { sticky: true });
        line.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onSelect({ tool: t, p, rank: i + 1 });
          cb.current.onInspect(geom, e.latlng.lat, e.latlng.lng, toolTitle(t, p, i + 1));
        });
        group.addLayer(line);
      });
      if (changed) {
        // In v1 but not in this version: dashed gray
        const cur = new Set(feats.map(featureKey));
        toolFeatures(data, "v1", t).forEach((p, i) => {
          if (!inBudget(t, p, view.km) || cur.has(featureKey(p))) return;
          const line = L.geoJSON(data.geoms[p.g], { style: { color: "#555", weight: 2.5, dashArray: "3 5", opacity: 0.9 } });
          line.bindTooltip("<b>Dropped vs v1</b><br>" + toolTooltip(t, p, i + 1), { sticky: true });
          line.on("click", (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            cb.current.onInspect(data.geoms[p.g], e.latlng.lat, e.latlng.lng, "Dropped vs v1: " + toolTitle(t, p, i + 1));
          });
          group.addLayer(line);
        });
      }
    }
    const show = (l: L.Layer, on: boolean) => (on ? l.addTo(map) : l.remove());
    show(ins.painted, active && view.layers.painted);
    show(ins.crashes, active && view.layers.crashes);
    show(ins.commutes, active && view.layers.commutes);
    if (map.hasLayer(ins.commutes)) ins.commutes.bringToBack();
    // The protected network stays on in route mode, as faint context under the route
    const useV0 = active && view.version === "v0";
    show(ins.protected_v0, view.layers.protected && useV0);
    show(ins.protected, view.layers.protected && !useV0);
    for (const p of [ins.protected, ins.protected_v0]) {
      p.setStyle({ opacity: active ? 0.7 : 0.35, weight: active ? 2.2 : 1.6 });
      if (map.hasLayer(p)) p.bringToBack();
    }
    return () => {
      group.remove();
    };
  }, [map, data, view, selected, active]);
}
