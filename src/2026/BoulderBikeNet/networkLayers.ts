// "The network" mode: one BikeNetKit recommendation set at a time plus the input layers, drawn
// on the shared Leaflet map. Ported from scripts/boulder_bikenet/build_preview_map.py.
import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Feature, Geometry } from "geojson";
import { DEFAULT_VERSION, type NetworkData, type ToolId, type ToolProps, type VersionId } from "./types";
import { ACCENT, CRASH_COLOR, CLASS_COLOR, M_PER_MI, REC_DARK, TOOLS, toolTitle, toolTooltip } from "./style";
import { midpoint } from "./streetview";

export interface NetworkView {
  version: VersionId;
  tool: ToolId;
  diff: boolean; // highlight changes vs the default version (other versions only)
  mi: number; // Grow: first N miles of build order
  layers: { protected: boolean; painted: boolean; crashes: boolean };
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

export function inBudget(tool: ToolId, p: ToolProps, mi: number): boolean {
  if (!("length_cumulative" in p) || !isGrow(tool)) return true;
  return p.length_cumulative - p.length < mi * M_PER_MI;
}

/** The recommendations a view counts as "the plan": Grow within the slider budget, others all. */
export function planFeatures(data: NetworkData, view: NetworkView): ToolProps[] {
  return toolFeatures(data, view.version, view.tool).filter((p) => inBudget(view.tool, p, view.mi));
}

/** Number badge for the top-10 recommendations, matching the panel list. */
const rankIcon = (n: number, on: boolean) =>
  L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], html: `<div class="bbn-rank${on ? " on" : ""}">${n}</div>` });

export const featureKey = (p: ToolProps) => ("key" in p ? p.key : `g${p.g}`);

/** Is this version's output compared against the default on the map? */
export function showsDiff(data: NetworkData, view: NetworkView) {
  return view.diff && view.version !== DEFAULT_VERSION && view.tool !== "link" && data.differs[view.version].includes(view.tool);
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
    const built: Record<string, L.GeoJSON> = {
      protected: L.geoJSON(data.protected, { style: { color: CLASS_COLOR.protected, weight: 2.2, opacity: 0.7 }, interactive: false }),
      protected_shared: L.geoJSON(data.protected_shared, {
        style: { color: CLASS_COLOR["shared path/sidewalk"], weight: 2.2, opacity: 0.7 },
        interactive: false,
      }),
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
      const feats = all.filter((p) => inBudget(t, p, view.mi));
      const changed = showsDiff(data, view);
      const base = changed ? new Set(toolFeatures(data, DEFAULT_VERSION, t).filter((p) => inBudget(t, p, view.mi)).map(featureKey)) : null;
      const n = Math.max(1, feats.length);
      const dim = selected !== null;
      const of = data.tools[view.version][t]?.of ?? 3;
      // Agreement: the 2-method stretches contain the all-methods ones, so draw those on top
      const order = t === "agree" ? [...feats.keys()].reverse() : [...feats.keys()];
      for (const i of order) {
        const p = feats[i];
        const isNew = !!base && !base.has(featureKey(p));
        const isSel = p.g === selected;
        const all3 = "n" in p && p.n >= of;
        const geom = data.geoms[p.g];
        if (isSel) L.geoJSON(geom, { style: { color: "#111", weight: 11, opacity: 0.9 }, interactive: false }).addTo(group);
        const line = L.geoJSON(geom, {
          style: {
            color: isNew ? ACCENT : all3 ? REC_DARK : TOOLS[t].color,
            weight: isSel ? 6 : t === "agree" ? (all3 ? 7 : 4.5) : (isNew ? 6 : 5) - (3 * i) / n,
            opacity: isSel ? 1 : dim ? 0.3 : changed && !isNew ? 0.45 : 0.95,
          },
        });
        line.bindTooltip((isNew ? "<b>New vs default</b><br>" : "") + toolTooltip(t, p, i + 1, of), { sticky: true });
        line.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onSelect({ tool: t, p, rank: i + 1 });
          cb.current.onInspect(geom, e.latlng.lat, e.latlng.lng, toolTitle(t, p, i + 1));
        });
        group.addLayer(line);
      }
      // Numbers on the map for the panel's top 10
      feats.slice(0, 10).forEach((p, i) => {
        const pick = { tool: t, p, rank: i + 1 };
        const m = L.marker(midpoint(data.geoms[p.g]), { icon: rankIcon(i + 1, p.g === selected), keyboard: false, zIndexOffset: 500 });
        m.bindTooltip(toolTooltip(t, p, i + 1, of), { direction: "top", offset: [0, -8] });
        m.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          const [lat, lng] = midpoint(data.geoms[p.g]);
          cb.current.onSelect(pick);
          cb.current.onInspect(data.geoms[p.g], lat, lng, toolTitle(t, p, i + 1));
        });
        group.addLayer(m);
      });
      if (changed) {
        // In the default but not in this version: dashed gray
        const cur = new Set(feats.map(featureKey));
        toolFeatures(data, DEFAULT_VERSION, t).forEach((p, i) => {
          if (!inBudget(t, p, view.mi) || cur.has(featureKey(p))) return;
          const line = L.geoJSON(data.geoms[p.g], { style: { color: "#555", weight: 2.5, dashArray: "3 5", opacity: 0.9 } });
          line.bindTooltip("<b>Dropped vs default</b><br>" + toolTooltip(t, p, i + 1), { sticky: true });
          line.on("click", (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            cb.current.onInspect(data.geoms[p.g], e.latlng.lat, e.latlng.lng, "Dropped vs default: " + toolTitle(t, p, i + 1));
          });
          group.addLayer(line);
        });
      }
    }
    const show = (l: L.Layer, on: boolean) => (on ? l.addTo(map) : l.remove());
    show(ins.painted, active && view.layers.painted);
    show(ins.crashes, active && view.layers.crashes);
    // The protected network stays on in route mode, as faint context under the route
    show(ins.protected, view.layers.protected);
    show(ins.protected_shared, view.layers.protected && active && view.version.startsWith("shared"));
    for (const p of [ins.protected, ins.protected_shared]) {
      p.setStyle({ opacity: active ? 0.7 : 0.35, weight: active ? 2.2 : 1.6 });
      if (map.hasLayer(p)) p.bringToBack();
    }
    return () => {
      group.remove();
    };
  }, [map, data, view, selected, active]);
}
