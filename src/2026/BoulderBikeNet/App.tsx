import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useJsonData } from "../../hooks/useJsonData";
import { DEFAULT_VERSION, type GraphData, type NetworkData, type PhotoTarget, type ProfileId, type SidewalkPref } from "./types";
import { BikeGraph, type LatLng } from "./routing";
import { bearingAt, midpoint } from "./streetview";
import { planFeatures, toolFeatures, useNetworkLayers, type Inspect, type NetworkView, type Pick } from "./networkLayers";
import { usePins, useRouteLayers, type Slots } from "./routeLayers";
import { PlaceIndex, type Place, type PlacesData } from "./search";
import { DEFAULT_TOOL, toolName, toolTitle } from "./style";
import NetworkPanel from "./NetworkPanel";
import RoutePanel, { EXAMPLES, type GraphStatus, type PlanInfo } from "./RoutePanel";
import StreetViewPanel from "./StreetViewPanel";
import Tour, { TOUR, TOUR_MI, TOUR_RIDE } from "./Tour";
import "./App.css";

type Mode = "network" | "route";
type Snap = "peek" | "half" | "full"; // phone bottom-sheet stops

const PHONE = "(max-width: 760px)";
function useMedia(q: string) {
  const [on, setOn] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [q]);
  return on;
}

const INITIAL_VIEW: NetworkView = {
  version: DEFAULT_VERSION,
  tool: DEFAULT_TOOL,
  diff: true,
  mi: 19,
  layers: { protected: true, painted: false, crashes: false },
};

export default function App() {
  // Map-first app shell: the page itself doesn't scroll (so panel scrolling never drags the map off
  // screen) and the app fills the viewport below the site header. On phones the panel is a bottom
  // sheet over the map.
  const rootRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const phone = useMedia(PHONE);
  const [rootH, setRootH] = useState(0);
  const [peekH, setPeekH] = useState(170);
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.classList.add("bbn-shell");
    const root = rootRef.current!;
    const header = document.querySelector(".site-header");
    const measure = () => {
      root.style.setProperty("--bbn-header-h", `${header?.getBoundingClientRect().height ?? 0}px`);
      setRootH(root.clientHeight);
      const t = tabsRef.current;
      if (t) setPeekH(t.offsetTop + t.offsetHeight + 12); // title, intro and mode tabs
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (header) ro.observe(header);
    return () => {
      html.classList.remove("bbn-shell");
      ro.disconnect();
    };
  }, []);
  const [snap, setSnap] = useState<Snap>("peek");
  const [dragH, setDragH] = useState<number | null>(null);
  const stops: Record<Snap, number> = {
    peek: Math.min(peekH, Math.round(rootH * 0.45)),
    half: Math.round(rootH * 0.5),
    full: Math.max(rootH - 56, 0),
  };
  const sheetH = phone ? dragH ?? stops[snap] : 0;
  const dragRef = useRef<{ y0: number; h0: number; moved: boolean } | null>(null);
  const onHandleDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { y0: e.clientY, h0: sheetH, moved: false };
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setDragH(Math.min(Math.max(d.h0 - dy, 48), stops.full));
  };
  const onHandleUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) setSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek"); // tap cycles
    else if (dragH !== null) {
      const near = (Object.keys(stops) as Snap[]).reduce((a, b) => (Math.abs(stops[b] - dragH) < Math.abs(stops[a] - dragH) ? b : a));
      setSnap(near);
    }
    setDragH(null);
  };
  // Map framing keeps clear of the sheet; a full sheet drops to half so the framed spot is visible
  const reveal = (): L.FitBoundsOptions => {
    if (!phone) return { padding: [60, 60] };
    const s = snap === "full" ? "half" : snap;
    if (s !== snap) setSnap(s);
    return { paddingTopLeft: [40, 40], paddingBottomRight: [40, stops[s] + 30] };
  };

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
  const [planOn, setPlanOn] = useState(false);
  const [tour, setTour] = useState<number | null>(null); // step index while the tour is open
  const wantGraph = mode === "route" || tour !== null; // the tour ends on a ride, so fetch early
  useEffect(() => {
    if (!wantGraph || graph) return;
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
  }, [wantGraph, graph]);
  const today = useMemo(() => (graph && pins[0] && pins[1] ? graph.route(pins[0], pins[1], sidewalkPref) : null), [graph, pins, sidewalkPref]);

  // "With the plan built": the network view's recommendations become protected edges
  const planOnRoute = planOn && mode === "route" && !!graph && !!data;
  const allRecs = useMemo(() => (data ? toolFeatures(data, view.version, view.tool) : []), [data, view.version, view.tool]);
  const inPlan = useMemo(() => (data ? planFeatures(data, view).length : 0), [data, view]);
  const recEdges = useMemo(() => (graph ? allRecs.map((p) => graph.D.plan?.[p.g] ?? []) : []), [graph, allRecs]);
  const mask = useMemo(() => (planOnRoute && graph ? graph.planMask(recEdges.slice(0, inPlan)) : undefined), [planOnRoute, graph, recEdges, inPlan]);
  const planned = useMemo(() => (graph && mask && pins[0] && pins[1] ? graph.route(pins[0], pins[1], sidewalkPref, mask) : null), [graph, mask, pins, sidewalkPref]);
  const routes = mask ? planned : today;
  const firstK = useMemo(
    () => (planOnRoute && graph && today ? graph.improvesAt(today, profile, sidewalkPref, recEdges) : null),
    [planOnRoute, graph, today, profile, sidewalkPref, recEdges],
  );
  const used = useMemo(() => {
    const R = planned?.byProfile[profile];
    if (!graph || !mask || !R) return [];
    const onRoute = new Set(R.steps.filter((r) => graph.isNew(r, mask)).map((r) => graph.edgeId(r)));
    return allRecs
      .slice(0, inPlan)
      .map((p, i) => ({ rank: i + 1, name: toolName(p), hit: recEdges[i].some((k) => onRoute.has(k)) }))
      .filter((u) => u.hit);
  }, [graph, mask, planned, profile, allRecs, inPlan, recEdges]);

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
      attribution: "Tiles &copy; Esri | Data &copy; OpenStreetMap contributors, City of Boulder",
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
  const tourStep = tour === null ? null : TOUR[tour];
  const recs = tourStep !== "credits" && tourStep !== "today";
  useNetworkLayers(map, data, view, selected, mode === "network", inspect, select, recs);
  usePins(map, pins, movePin, mode === "route");
  const planGeoms = useMemo(() => (mask && data ? planFeatures(data, view).map((p) => data.geoms[p.g]) : null), [mask, data, view]);
  useRouteLayers(map, graph, routes, profile, ghosts, pins, mode === "route", inspect, mask, mask ? today : null, planGeoms);

  // Empty-map clicks: drop pins in route mode (until there are two), otherwise offer Street View there
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
    if (!map || !(a || b)) return;
    const pad = reveal();
    if (a && b) map.fitBounds(L.latLngBounds([a, b]), pad);
    else map.fitBounds(L.latLngBounds([(a ?? b)!, (a ?? b)!]), { ...pad, maxZoom: Math.max(map.getZoom(), 15) });
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

  // List click: highlight it on the map, frame it, and offer Street View from its middle
  const pick = (k: Pick | null) => {
    setSelected(k ? k.p.g : null);
    if (!k) {
      setPhoto(null);
      return;
    }
    if (!map || !data) return;
    const geom = data.geoms[k.p.g];
    map.fitBounds(L.geoJSON(geom).getBounds(), { maxZoom: 17, ...reveal() });
    const [lat, lng] = midpoint(geom);
    setPhoto({ lat, lng, bearing: bearingAt(geom, lat, lng), title: toolTitle(k.tool, k.p, k.rank) });
  };

  // Tour: each step sets the map from scratch, so Back and Next land on the same picture
  const anim = useRef(0);
  // Core of town (the city boundary also takes in outlying open space and the reservoir)
  const fitCity = () => map?.fitBounds(L.latLngBounds([39.978, -105.285], [40.06, -105.212]), reveal());
  const goTour = (i: number) => {
    if (!data) return;
    cancelAnimationFrame(anim.current);
    const step = TOUR[i];
    setTour(i);
    setPhoto(null);
    setSelected(null);
    setPlanOn(step === "ride");
    setMode(step === "ride" ? "route" : "network");
    const tool = step === "fix" ? "fix" : step === "link" ? "link" : step === "agree" ? "agree" : DEFAULT_TOOL;
    setViewRaw({ ...INITIAL_VIEW, tool, mi: TOUR_MI });
    if (step === "fix") {
      const p = toolFeatures(data, DEFAULT_VERSION, "fix")[0];
      if (p) return pick({ tool: "fix", p, rank: 1 });
    }
    if (step === "ride") {
      setProfile("balanced");
      setSidewalkPref("road");
      setGhosts(true);
      return example(TOUR_RIDE);
    }
    fitCity();
    if (step === "extend" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Grow the build order in, half a mile at a time
      const t0 = performance.now(), ms = 2400;
      const tick = (t: number) => {
        const mi = Math.max(0.5, Math.round(2 * TOUR_MI * Math.min(1, (t - t0) / ms)) / 2);
        setViewRaw((v) => (v.mi === mi ? v : { ...v, mi }));
        if (mi < TOUR_MI) anim.current = requestAnimationFrame(tick);
      };
      setViewRaw((v) => ({ ...v, mi: 0.5 }));
      anim.current = requestAnimationFrame(tick);
    }
  };
  const startTour = () => {
    if (phone) setSnap("half");
    goTour(0);
  };
  // Leaving the tour puts everything back to the page defaults; finishing opens an empty route
  const endTour = (toRoute: boolean) => {
    cancelAnimationFrame(anim.current);
    setTour(null);
    setPhoto(null);
    setSelected(null);
    setViewRaw(INITIAL_VIEW);
    setPlanOn(false);
    setPins([null, null]);
    setLabels(["", ""]);
    setProfile("balanced");
    setSidewalkPref("road");
    setGhosts(true);
    setMode(toRoute ? "route" : "network");
    fitCity();
    if (toRoute && !phone) setTimeout(() => document.querySelector<HTMLInputElement>(".bbn-search input:not([disabled])")?.focus(), 0);
  };
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const switchMode = (m: Mode) => {
    setMode(m);
    setPhoto(null);
    if (phone && snap === "peek") setSnap("half");
  };

  return (
    <div ref={rootRef} className="bbn-root" style={{ "--bbn-sheet-h": `${sheetH}px` } as React.CSSProperties}>
      <aside className={`bbn-panel${dragH !== null ? " dragging" : ""}`} style={phone ? { height: sheetH } : undefined}>
        <button
          className="bbn-handle"
          aria-label={snap === "full" ? "Collapse the panel" : "Expand the panel"}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <i />
        </button>
        <div className="bbn-panel-body">
          <h1>Boulder's bike network</h1>
          {tour !== null && data ? (
            <Tour
              step={tour}
              go={goTour}
              skip={() => endTour(false)}
              finish={() => endTour(true)}
              data={data}
              ride={{
                today: today?.byProfile.balanced ?? null,
                plan: planned?.byProfile.balanced ?? null,
                loading: graphStatus === "loading",
              }}
            />
          ) : (
          <>
          <p className="bbn-muted">
            Where should Boulder build next, and how does your own ride look today? Recommendations from{" "}
            <a href="https://bikenetkit.org" target="_blank" rel="noopener noreferrer">BikeNetKit</a>. Click any line or spot to
            open it in Google Street View.
          </p>
          <button className="bbn-btn bbn-btn-go bbn-tour-offer" onClick={startTour} disabled={!data}>
            New here? Take the 1-minute tour
          </button>
          <div ref={tabsRef} className="bbn-seg bbn-modes" role="tablist">
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
              plan={{
                on: planOn,
                setOn: setPlanOn,
                data: data ?? null,
                view,
                set: (patch) => setView({ ...view, ...patch }),
                today,
                feats: allRecs,
                inPlan,
                firstK,
                used,
              } satisfies PlanInfo}
            />
          )}
          </>
          )}
        </div>
      </aside>
      <div className="bbn-mapwrap">
        <div ref={mapDiv} className="bbn-map" />
        {photo && <StreetViewPanel map={map} target={photo} onClose={() => setPhoto(null)} />}
      </div>
    </div>
  );
}
