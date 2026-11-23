import type { LatLng, RouteResult, Routes } from "./routing";
import type { BikeClass, NetworkData, ProfileId, SidewalkPref, ToolId, ToolProps } from "./types";
import type { Place, PlaceIndex } from "./search";
import type { Slots } from "./routeLayers";
import { PIN_COLORS } from "./routeLayers";
import { isGrow, type NetworkView } from "./networkLayers";
import { BudgetSlider } from "./NetworkPanel";
import { CLASS_COLOR, CLASS_LABEL, M_PER_MI, PROFILES, REC_COLOR, SIDEWALK_PREFS, SPEED_MPH, TOOLS, fmtLen, fmtMi, rideMin } from "./style";
import SearchBox from "./SearchBox";

// Rough neighborhood points (same as scripts/boulder_bikenet/route_test.py)
export const EXAMPLES: { a: string; b: string; la: LatLng; lb: LatLng }[] = [
  { a: "South Boulder", b: "Downtown Pearl", la: [39.9868, -105.247], lb: [40.0176, -105.2795] },
  { a: "North Boulder", b: "CU campus", la: [40.045, -105.283], lb: [40.0089, -105.2706] },
  { a: "East Boulder", b: "Downtown Pearl", la: [40.0125, -105.224], lb: [40.0176, -105.2795] },
  { a: "South Boulder", b: "East Pearl", la: [39.9868, -105.247], lb: [40.0203, -105.252] },
];

export type GraphStatus = "loading" | "error" | "ready";

/** Smallest change in route cost that counts as the plan changing a ride. */
export const MIN_GAIN = 0.005;

/** "With the plan built": the network view's recommendations, applied to the street graph. */
export interface PlanInfo {
  on: boolean;
  setOn: (on: boolean) => void;
  data: NetworkData | null;
  view: NetworkView;
  set: (patch: Partial<NetworkView>) => void;
  today: Routes | null; // same pins, today's network
  feats: ToolProps[]; // the method's full list, in build order
  inPlan: number; // how many of them the view counts as built
  firstK: number | null; // fewest recommendations that change this ride (selected profile)
  used: { rank: number; name: string }[]; // recommendations the planned route rides on
}

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
  plan: PlanInfo;
}

const pct = (x: number, of: number) => `${Math.round((100 * x) / of)}%`;
export const offRoad = (x: RouteResult) => x.by.protected + x.by["shared path/sidewalk"];
const PLAN_TOOLS: ToolId[] = ["grow_existing", "agree", "fix", "link", "grow"];

/** Route split by class; in plan mode, the protected share is split into today's and the plan's new links. */
function ClassBar({ R, classes }: { R: RouteResult; classes: BikeClass[] }) {
  return (
    <div className="bbn-bar">
      {classes.map((c) =>
        c === "protected" ? (
          [
            <i key="p" style={{ width: pct(R.by.protected - R.planned, R.m), background: CLASS_COLOR.protected }} title={CLASS_LABEL.protected} />,
            <i key="n" style={{ width: pct(R.planned, R.m), background: REC_COLOR }} title="New protected link (the plan)" />,
          ]
        ) : (
          <i key={c} style={{ width: pct(R.by[c], R.m), background: CLASS_COLOR[c] }} title={CLASS_LABEL[c]} />
        ),
      )}
    </div>
  );
}

function PlanBox({ plan, R, T, classes }: { plan: PlanInfo; R: RouteResult; T: RouteResult; classes: BikeClass[] }) {
  const { data, view, set, feats, inPlan, firstK, used } = plan;
  if (!data) return null;
  const grow = isGrow(view.tool);
  const changed = R.cost < T.cost * (1 - MIN_GAIN);
  const kind = view.tool === "fix" ? "gap" : view.tool === "link" ? "connection" : view.tool === "agree" ? "stretch" : "link";
  const miAt = (k: number) => Math.ceil((2 * (feats[k - 1] as { length_cumulative: number }).length_cumulative) / M_PER_MI) / 2;
  const total = grow && feats.length ? `all ${miAt(feats.length)} mi of it` : `all ${feats.length} of them`;
  const dm = R.m - T.m;
  return (
    <div className="bbn-plan">
      <h2>The plan</h2>
      <select value={view.tool} onChange={(e) => set({ tool: e.target.value as ToolId })} aria-label="Recommendation method">
        {PLAN_TOOLS.filter((t) => data.tools[view.version][t]).map((t) => (
          <option key={t} value={t}>{TOOLS[t].label}</option>
        ))}
      </select>
      {grow && <BudgetSlider data={data} view={view} set={set} />}
      {changed ? (
        <>
          <div className="bbn-bars">
            <span>Today</span>
            <ClassBar R={T} classes={classes} />
            <span>Plan</span>
            <ClassBar R={R} classes={classes} />
          </div>
          <div className="bbn-delta">
            Off the road: {pct(offRoad(T), T.m)} → <b>{pct(offRoad(R), R.m)}</b>
            {T.by["busy street"] > 0 && <> · busy streets: {pct(T.by["busy street"], T.m)} → <b>{pct(R.by["busy street"], R.m)}</b></>}
            {Math.abs(dm) >= 30 && <> · {dm > 0 ? "+" : "−"}{fmtLen(Math.abs(dm))}</>}
          </div>
          {used.length > 0 && (
            <div className="bbn-muted">
              Rides on {kind} {used.slice(0, 4).map((u) => `#${u.rank} ${u.name}`).join(", ")}
              {used.length > 4 ? ` and ${used.length - 4} more` : ""}.
            </div>
          )}
          {grow && firstK !== null && firstK < inPlan && (
            <div className="bbn-muted bbn-small">Your ride first gets better at {miAt(firstK)} mi of build order.</div>
          )}
        </>
      ) : firstK === null ? (
        <p className="bbn-muted">
          {R.planned > 0 ? `These recommendations barely touch this ride (${fmtLen(R.planned)} of new path)` : "None of these recommendations changes this ride"},
          even {total}.
        </p>
      ) : grow ? (
        <p className="bbn-muted">
          {R.planned > 0
            ? `The first ${view.mi} mi barely touch this ride (${fmtLen(R.planned)} of new path).`
            : `Nothing in the first ${view.mi} mi changes this ride.`}{" "}
          It gets better at <b>{miAt(firstK)} mi</b> of build order.{" "}
          <button className="bbn-link" onClick={() => set({ mi: miAt(firstK) })}>Show that</button>
        </p>
      ) : (
        <p className="bbn-muted">This ride doesn't change.</p>
      )}
    </div>
  );
}

export default function RoutePanel(props: Props) {
  const { status, classes, routes, places, pins, labels, setPin, swap, locate, locateMsg, example, profile, setProfile, ghosts, setGhosts, sidewalkPref, setSidewalkPref, plan } =
    props;
  const R = routes?.byProfile[profile];
  const T = plan.today?.byProfile[profile];
  const direct = routes?.byProfile.direct;
  // Other styles that find exactly this route
  const same = R && routes
    ? (Object.keys(PROFILES) as ProfileId[]).filter((p) => p !== profile && routes.byProfile[p]?.steps.join() === R.steps.join())
    : [];

  let prompt = "";
  if (status === "loading") prompt = "Loading Boulder's street network (about 0.8 MB)…";
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
      <p className="bbn-muted">
        {PROFILES[profile].desc}
        {same.length > 0 && ` On this ride, ${same.map((p) => PROFILES[p].name).join(" and ")} ${same.length > 1 ? "find" : "finds"} the same route.`}
      </p>
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
          <h2>Your ride</h2>
          <div className="bbn-seg">
            <button className={!plan.on ? "on" : ""} onClick={() => plan.setOn(false)}>Today</button>
            <button className={plan.on ? "on" : ""} onClick={() => plan.setOn(true)}>With the plan built</button>
          </div>
          <div className="bbn-big">
            {fmtMi(R.m)} mi <small>· about {rideMin(R.m)} min at {SPEED_MPH} mph</small>
          </div>
          {R.via.length > 0 && <div className="bbn-muted">Mostly via {R.via.join(", ")}</div>}
          <ClassBar R={R} classes={classes} />
          <div className="bbn-legend">
            {R.planned >= 0.005 * R.m && (
              <div>
                <i className="bbn-sw" style={{ background: REC_COLOR }} />
                New protected link (the plan)
                <span className="bbn-pct">{pct(R.planned, R.m)}</span>
              </div>
            )}
            {classes.map((c) => [c, c === "protected" ? R.by[c] - R.planned : R.by[c]] as const)
              .filter(([, m]) => m >= 0.005 * R.m) // rows that would round to 0% only add noise
              .sort((a, b) => b[1] - a[1])
              .map(([c, m]) => (
                <div key={c}>
                  <i className="bbn-sw" style={{ background: CLASS_COLOR[c] }} />
                  {CLASS_LABEL[c]}
                  <span className="bbn-pct">{pct(m, R.m)}</span>
                </div>
              ))}
          </div>
          {R.by["shared path/sidewalk"] >= 50 && (
            <p className="bbn-muted bbn-small">
              {fmtLen(R.by["shared path/sidewalk"])} is on sidewalks or walking paths where bikes are allowed: off the road, but
              shared with people on foot, so expect to slow down.
            </p>
          )}
          {R.by["path/sidewalk (untagged)"] >= 50 && (
            <p className="bbn-muted bbn-small">
              {fmtLen(R.by["path/sidewalk (untagged)"])} is on paths where OpenStreetMap doesn't say whether bikes are allowed. Know
              the answer? Click the purple stretch and leave a note for OpenStreetMap's mappers.
            </p>
          )}
          {R.by.dismount > 0 && (
            <p className="bbn-muted bbn-small">
              {fmtLen(R.by.dismount)} where riding isn't allowed (dismount zones, no-bikes paths): walk your bike there.
            </p>
          )}

          {plan.on && T && <PlanBox plan={plan} R={R} T={T} classes={classes} />}

          <h2>Compare styles</h2>
          <table className="bbn-table">
            <thead>
              <tr><th>Style</th><th>mi</th><th>extra</th><th>off road</th><th>busy st.</th></tr>
            </thead>
            <tbody>
              {(Object.keys(PROFILES) as ProfileId[]).map((p) => {
                const x = routes.byProfile[p];
                if (!x) return null;
                const extra = direct ? 100 * (x.m / direct.m - 1) : 0;
                return (
                  <tr key={p} className={p === profile ? "sel" : ""} onClick={() => setProfile(p)}>
                    <td>{PROFILES[p].name}</td>
                    <td>{fmtMi(x.m)}</td>
                    <td>{extra < 0.5 ? "—" : `+${Math.round(extra)}%`}</td>
                    <td>{pct(offRoad(x), x.m)}</td>
                    <td>{pct(x.by["busy street"], x.m)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <label className="bbn-check">
            <input type="checkbox" checked={ghosts} onChange={(e) => setGhosts(e.target.checked)} />{" "}
            {plan.on ? "Show today's route on the map" : "Show the other styles on the map"}
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
        Off road = protected paths plus sidewalks where bikes are allowed. Lanes count per direction of travel. The plan treats
        each recommended link as a protected path; one-way streets stay one-way.
      </p>
    </>
  );
}

