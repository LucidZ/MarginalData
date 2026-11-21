import type { LatLng, Routes } from "./routing";
import type { BikeClass, ProfileId, SidewalkPref } from "./types";
import type { Place, PlaceIndex } from "./search";
import type { Slots } from "./routeLayers";
import { PIN_COLORS } from "./routeLayers";
import { CLASS_COLOR, CLASS_LABEL, PROFILES, SIDEWALK_PREFS, SPEED_KMH } from "./style";
import SearchBox from "./SearchBox";

// Rough neighborhood points (same as scripts/boulder_bikenet/route_test.py)
export const EXAMPLES: { a: string; b: string; la: LatLng; lb: LatLng }[] = [
  { a: "South Boulder", b: "Downtown Pearl", la: [39.9868, -105.247], lb: [40.0176, -105.2795] },
  { a: "North Boulder", b: "CU campus", la: [40.045, -105.283], lb: [40.0089, -105.2706] },
  { a: "East Boulder", b: "Downtown Pearl", la: [40.0125, -105.224], lb: [40.0176, -105.2795] },
  { a: "South Boulder", b: "East Pearl", la: [39.9868, -105.247], lb: [40.0203, -105.252] },
];

export type GraphStatus = "loading" | "error" | "ready";

interface Props {
  status: GraphStatus;
  classes: BikeClass[];
  routes: Routes | null;
  places: PlaceIndex | null;
  pins: Slots;
  labels: [string, string];
  setPin: (i: number, p: Place | null) => void;
  swap: () => void;
  locate: () => void;
  locateMsg: string;
  example: (i: number) => void;
  profile: ProfileId;
  setProfile: (p: ProfileId) => void;
  ghosts: boolean;
  setGhosts: (on: boolean) => void;
  sidewalkPref: SidewalkPref;
  setSidewalkPref: (p: SidewalkPref) => void;
}

const pct = (x: number, of: number) => `${Math.round((100 * x) / of)}%`;

export default function RoutePanel(props: Props) {
  const { status, classes, routes, places, pins, labels, setPin, swap, locate, locateMsg, example, profile, setProfile, ghosts, setGhosts, sidewalkPref, setSidewalkPref } =
    props;
  const R = routes?.byProfile[profile];
  const direct = routes?.byProfile.direct;

  let prompt = "";
  if (status === "loading") prompt = "Loading Boulder's street network (about 0.7 MB)…";
  else if (status === "error") prompt = "Couldn't load the street network. Reload to try again.";
  else if (!pins[0] || !pins[1]) prompt = "";
  else if (!R) prompt = "No route found between these points.";

  return (
    <>
      <div className="bbn-fromto">
        <SearchBox index={places} badge="A" color={PIN_COLORS[0]} placeholder="From: address or place" value={labels[0]}
          onPick={(p) => setPin(0, p)} onClear={() => setPin(0, null)} />
        <SearchBox index={places} badge="B" color={PIN_COLORS[1]} placeholder="To: address or place" value={labels[1]}
          onPick={(p) => setPin(1, p)} onClear={() => setPin(1, null)} />
        <div className="bbn-fromto-ctl">
          <button className="bbn-link" onClick={locate}>Use my location</button>
          <button className="bbn-link" onClick={swap} disabled={!pins[0] && !pins[1]}>⇅ Swap</button>
          <span className="bbn-muted">or click the map</span>
        </div>
        {locateMsg && <div className="bbn-muted">{locateMsg}</div>}
      </div>
      <p className="bbn-muted bbn-small">Search and routing run in your browser. Nothing you type or click is sent anywhere.</p>
      <h2>Route style</h2>
      <div className="bbn-seg bbn-seg-3">
        {(Object.keys(PROFILES) as ProfileId[]).map((p) => (
          <button key={p} className={p === profile ? "on" : ""} onClick={() => setProfile(p)}>
            <b>{PROFILES[p].name}</b>
            <span>{PROFILES[p].short}</span>
          </button>
        ))}
      </div>
      <p className="bbn-muted">{PROFILES[profile].desc}</p>
      <h2>Where bikes may use the sidewalk, prefer</h2>
      <div className="bbn-seg">
        {(Object.keys(SIDEWALK_PREFS) as SidewalkPref[]).map((p) => (
          <button key={p} className={p === sidewalkPref ? "on" : ""} onClick={() => setSidewalkPref(p)}>
            {SIDEWALK_PREFS[p].name}
          </button>
        ))}
      </div>
      <p className="bbn-muted">{SIDEWALK_PREFS[sidewalkPref].desc}</p>

      {prompt && <div className="bbn-empty">{prompt}</div>}

      {R && routes && (
        <>
          <div className="bbn-big">
            {(R.m / 1000).toFixed(1)} km <small>· about {Math.round((R.m / 1000 / SPEED_KMH) * 60)} min at {SPEED_KMH} km/h</small>
          </div>
          {R.via.length > 0 && <div className="bbn-muted">Mostly via {R.via.join(", ")}</div>}
          <div className="bbn-bar">
            {classes.map((c) => (
              <i key={c} style={{ width: pct(R.by[c], R.m), background: CLASS_COLOR[c] }} title={CLASS_LABEL[c]} />
            ))}
          </div>
          <div className="bbn-legend">
            {classes.filter((c) => R.by[c] > 0).sort((a, b) => R.by[b] - R.by[a]).map((c) => (
              <div key={c}>
                <i className="bbn-sw" style={{ background: CLASS_COLOR[c] }} />
                {CLASS_LABEL[c]}
                <span className="bbn-pct">{pct(R.by[c], R.m)}</span>
              </div>
            ))}
          </div>
          {R.by["shared path/sidewalk"] > 0 && (
            <p className="bbn-muted bbn-small">
              {(R.by["shared path/sidewalk"] / 1000).toFixed(1)} km is on sidewalks or walking paths where bikes are allowed: off
              the road, but shared with people on foot, so expect to slow down.
            </p>
          )}
          {R.by.dismount > 0 && (
            <p className="bbn-muted bbn-small">
              {Math.round(R.by.dismount)} m where riding isn't allowed (dismount zones, no-bikes paths): walk your bike there.
            </p>
          )}

          <h2>Compare styles</h2>
          <table className="bbn-table">
            <thead>
              <tr><th>Style</th><th>km</th><th>extra</th><th>protected</th><th>busy st.</th></tr>
            </thead>
            <tbody>
              {(Object.keys(PROFILES) as ProfileId[]).map((p) => {
                const x = routes.byProfile[p];
                if (!x) return null;
                const extra = direct ? 100 * (x.m / direct.m - 1) : 0;
                return (
                  <tr key={p} className={p === profile ? "sel" : ""} onClick={() => setProfile(p)}>
                    <td>{PROFILES[p].name}</td>
                    <td>{(x.m / 1000).toFixed(1)}</td>
                    <td>{extra < 0.5 ? "—" : `+${Math.round(extra)}%`}</td>
                    <td>{pct(x.by.protected + x.by["shared path/sidewalk"], x.m)}</td>
                    <td>{pct(x.by["busy street"], x.m)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <label className="bbn-check">
            <input type="checkbox" checked={ghosts} onChange={(e) => setGhosts(e.target.checked)} /> Show the other styles on the map
          </label>
        </>
      )}

      <h2>Try an example</h2>
      <div className="bbn-examples">
        {EXAMPLES.map((x, i) => (
          <button key={x.a + x.b} className="bbn-link" onClick={() => example(i)} disabled={status !== "ready"}>
            {x.a} → {x.b}
          </button>
        ))}
      </div>
      {(pins[0] || pins[1]) && <button className="bbn-btn" onClick={() => { setPin(0, null); setPin(1, null); }}>Clear route</button>}

      <p className="bbn-muted bbn-note">
        Protected = separated paths and cycle tracks. Painted = on-street bike lanes. Busy street = arterial with no bike lane.
        Lanes count per direction of travel.
      </p>
    </>
  );
}
