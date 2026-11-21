import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useJsonData } from "../../hooks/useJsonData";
import { DEFAULT_VERSION, type GraphData, type NetworkData, type PhotoTarget, type ProfileId, type SidewalkPref } from "./types";
import { BikeGraph, type LatLng } from "./routing";
import { bearingAt, midpoint } from "./photos";
import { useNetworkLayers, type Inspect, type NetworkView, type Pick } from "./networkLayers";
import { usePins, useRouteLayers, type Slots } from "./routeLayers";
import { PlaceIndex, type Place, type PlacesData } from "./search";
import { DEFAULT_TOOL, toolTitle } from "./style";
import NetworkPanel from "./NetworkPanel";
import RoutePanel, { EXAMPLES, type GraphStatus } from "./RoutePanel";
import PhotoPanel from "./PhotoPanel";
import "./App.css";

type Mode = "network" | "route";

const INITIAL_VIEW: NetworkView = {
  version: DEFAULT_VERSION,
  tool: DEFAULT_TOOL,
  diff: true,
  km: 30,
  layers: { protected: true, painted: false, crashes: false, commutes: false },
};

export default function App() {
  const { data, error } = useJsonData<NetworkData>("/data/boulder-bikenet/network.json");
  const [mode, setMode] = useState<Mode>("network");
  const [view, setViewRaw] = useState<NetworkView>(INITIAL_VIEW);
  const [selected, setSelected] = useState<number | null>(null); // geometry index of the highlighted rec
  const setView = (v: NetworkView) => {
    if (v.tool !== view.tool || v.version !== view.version) setSelected(null);
    setViewRaw(v);
  };
  const [photo, setPhoto] = useState<PhotoTarget | null>(null);

  // Route mode: the street graph and the address list are fetched the first time it's opened
  const [graph, setGraph] = useState<BikeGraph | null>(null);
  const [graphStatus, setGraphStatus] = useState<GraphStatus>("loading");
  const [places, setPlaces] = useState<PlaceIndex | null>(null);
  const [pins, setPins] = useState<Slots>([null, null]);
  const [labels, setLabels] = useState<[string, string]>(["", ""]);
  const [locateMsg, setLocateMsg] = useState("");
  const [profile, setProfile] = useState<ProfileId>("balanced");
  const [ghosts, setGhosts] = useState(true);
  const [sidewalkPref, setSidewalkPref] = useState<SidewalkPref>("road");
  useEffect(() => {
    if (mode !== "route" || graph) return;
    let cancelled = false;
    setGraphStatus("loading");
    fetch("/data/boulder-bikenet/graph.json")
      .then((r) => {
        if (!r.ok) throw new Error(`graph.json: ${r.status}`);
        return r.json() as Promise<GraphData>;
      })
      .then((D) => {
        if (cancelled) return;
        setGraph(new BikeGraph(D));
        setGraphStatus("ready");
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setGraphStatus("error");
      });
    fetch("/data/boulder-bikenet/places.json")
      .then((r) => (r.ok ? (r.json() as Promise<PlacesData>) : Promise.reject(new Error(`places.json: ${r.status}`))))
      .then((D) => !cancelled && setPlaces(new PlaceIndex(D)))
      .catch((e) => console.error(e)); // search box stays disabled; map clicks still work
    return () => {
      cancelled = true;
    };
  }, [mode, graph]);
  const routes = useMemo(() => (graph && pins[0] && pins[1] ? graph.route(pins[0], pins[1], sidewalkPref) : null), [graph, pins, sidewalkPref]);

  // Pin edits. `label` defaults to the nearest address.
  const placesRef = useRef(places);
  placesRef.current = places;
  const setSlot = useCallback((i: number, ll: LatLng | null, label?: string) => {
    setPins((prev) => (i ? [prev[0], ll] : [ll, prev[1]]));
    setLabels((prev) => {
      const text = !ll ? "" : label ?? placesRef.current?.nearest(ll) ?? "Dropped pin";
      return i ? [prev[0], text] : [text, prev[1]];
    });
  }, []);
  const movePin = useCallback((i: number, ll: LatLng, done: boolean) => {
    if (done) setSlot(i, ll);
    else setPins((prev) => (i ? [prev[0], ll] : [ll, prev[1]]));
  }, [setSlot]);

  // Map
  const mapDiv = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  useEffect(() => {
    if (!mapDiv.current) return;
    const m = L.map(mapDiv.current, { preferCanvas: true, zoomControl: true }).setView([40.015, -105.255], 13);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri | Data &copy; OpenStreetMap contributors, City of Boulder, US Census LODES, Mapillary",
      maxZoom: 19,
      maxNativeZoom: 16,
    }).addTo(m);
    setMap(m);
    return () => {
      m.remove();
    };
  }, []);
  useEffect(() => {
    if (!map || !data) return;
    const b = L.geoJSON(data.boundary, { style: { color: "#888", weight: 1, fill: false, dashArray: "4 4" }, interactive: false }).addTo(map);
    return () => {
      b.remove();
    };
  }, [map, data]);

  const inspect: Inspect = useCallback((geom, lat, lng, title) => setPhoto({ lat, lng, bearing: bearingAt(geom, lat, lng), title }), []);
  const select = useCallback((p: Pick) => setSelected(p.p.g), []);
  useNetworkLayers(map, data, view, selected, mode === "network", inspect, select);
  usePins(map, pins, movePin, mode === "route");
  useRouteLayers(map, graph, routes, profile, ghosts, pins, mode === "route", inspect);

  // Empty-map clicks: drop pins in route mode (until there are two), otherwise look for photos
  const clickState = useRef({ mode, pins, graphStatus });
  clickState.current = { mode, pins, graphStatus };
  useEffect(() => {
    if (!map) return;
    const onClick = (e: L.LeafletMouseEvent) => {
      const s = clickState.current;
      if (s.mode === "route" && (!s.pins[0] || !s.pins[1])) {
        if (s.graphStatus === "ready") setSlot(s.pins[0] ? 1 : 0, [e.latlng.lat, e.latlng.lng]);
        return;
      }
      setPhoto({ lat: e.latlng.lat, lng: e.latlng.lng, bearing: null, title: "Clicked spot" });
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, setSlot]);

  // Frame whatever pins are set
  const frame = (a: LatLng | null, b: LatLng | null) => {
    if (!map) return;
    if (a && b) map.fitBounds(L.latLngBounds([a, b]), { padding: [60, 60] });
    else if (a || b) map.setView((a ?? b)!, Math.max(map.getZoom(), 15));
  };
  const pickPlace = (i: number, p: Place | null) => {
    setSlot(i, p ? p.ll : null, p?.label);
    if (p) frame(i ? pins[0] : p.ll, i ? p.ll : pins[1]);
  };
  const example = (i: number) => {
    const x = EXAMPLES[i];
    setSlot(0, x.la, x.a);
    setSlot(1, x.lb, x.b);
    frame(x.la, x.lb);
  };
  const swap = () => {
    setPins([pins[1], pins[0]]);
    setLabels([labels[1], labels[0]]);
  };
  const locate = () => {
    if (!navigator.geolocation) return setLocateMsg("Your browser doesn't share location.");
    setLocateMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const ll: LatLng = [coords.latitude, coords.longitude];
        if (!graph || graph.snapDistance(ll) > 1500) return setLocateMsg("You look to be outside Boulder. Search or click the map instead.");
        setLocateMsg("");
        setSlot(0, ll, "My location");
        frame(ll, pins[1]);
      },
      () => setLocateMsg("Location unavailable. Search or click the map instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // List click: highlight it on the map, frame it, and show a photo from its middle
  const pick = (k: Pick | null) => {
    setSelected(k ? k.p.g : null);
    if (!k) {
      setPhoto(null);
      return;
    }
    if (!map || !data) return;
    const geom = data.geoms[k.p.g];
    map.fitBounds(L.geoJSON(geom).getBounds(), { maxZoom: 17, padding: [60, 60] });
    const [lat, lng] = midpoint(geom);
    setPhoto({ lat, lng, bearing: bearingAt(geom, lat, lng), title: toolTitle(k.tool, k.p, k.rank) });
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setPhoto(null);
  };

  return (
    <div className="bbn-root">
      <aside className="bbn-panel">
        <h1>Boulder's bike network</h1>
        <p className="bbn-muted">
          Where should Boulder build next, and how does your own ride look today? Click any line or spot for the nearest
          street-level photo.
        </p>
        <div className="bbn-seg bbn-modes" role="tablist">
          <button role="tab" aria-selected={mode === "network"} className={mode === "network" ? "on" : ""} onClick={() => switchMode("network")}>
            The network
          </button>
          <button role="tab" aria-selected={mode === "route"} className={mode === "route" ? "on" : ""} onClick={() => switchMode("route")}>
            Your route
          </button>
        </div>
        {error && <div className="bbn-empty">Couldn't load the map data. Reload to try again.</div>}
        {!data && !error && <div className="bbn-empty">Loading…</div>}
        {data && mode === "network" && <NetworkPanel data={data} view={view} setView={setView} selected={selected} onPick={pick} />}
        {mode === "route" && (
          <RoutePanel
            status={graphStatus}
            classes={graph?.D.classes ?? []}
            routes={routes}
            places={places}
            pins={pins}
            labels={labels}
            setPin={pickPlace}
            swap={swap}
            locate={locate}
            locateMsg={locateMsg}
            example={example}
            profile={profile}
            setProfile={setProfile}
            ghosts={ghosts}
            setGhosts={setGhosts}
            sidewalkPref={sidewalkPref}
            setSidewalkPref={setSidewalkPref}
          />
        )}
      </aside>
      <div className="bbn-mapwrap">
        <div ref={mapDiv} className="bbn-map" />
        {photo && <PhotoPanel map={map} target={photo} onClose={() => setPhoto(null)} />}
      </div>
    </div>
  );
}
