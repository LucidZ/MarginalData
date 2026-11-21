import { DEFAULT_VERSION, type NetworkData, type ToolId, type VersionId } from "./types";
import { CLASS_COLOR, COMMUTE_COLOR, CRASH_COLOR, TOOLS, toolName } from "./style";
import { featureKey, isGrow, showsDiff, toolFeatures, type NetworkView, type Pick } from "./networkLayers";

interface Props {
  data: NetworkData;
  view: NetworkView;
  setView: (v: NetworkView) => void;
  selected: number | null;
  onPick: (pick: Pick | null) => void;
}

const TOOL_ORDER: ToolId[] = ["grow_existing", "grow", "fix", "link"];

export default function NetworkPanel({ data, view, setView, selected, onPick }: Props) {
  const set = (patch: Partial<NetworkView>) => setView({ ...view, ...patch });
  const shared = view.version.startsWith("shared"), crashes = view.version.endsWith("_crashes");
  // Fix isn't run with shared sidewalks counted as protected
  const pickVersion = (s: boolean, c: boolean) =>
    set({ version: `${s ? "shared" : "bike"}${c ? "_crashes" : ""}` as VersionId, ...(s && view.tool === "fix" ? { tool: "grow_existing" } : {}) });
  const tool = TOOLS[view.tool];

  const feats = toolFeatures(data, view.version, view.tool).slice(0, 10);
  const base = new Set(toolFeatures(data, DEFAULT_VERSION, view.tool).slice(0, 10).map(featureKey));
  const mark = showsDiff(data, view);

  return (
    <>
      <h2>Recommendation</h2>
      <div className="bbn-rec">
        <span className="bbn-sw" style={{ background: tool.color }} />
        <b>{tool.label}</b>
      </div>
      <p className="bbn-muted">{tool.desc}</p>
      {isGrow(view.tool) && (
        <>
          <div className="bbn-muted">Show the first <b>{view.km}</b> km of build order</div>
          <input type="range" min={2} max={115} step={1} value={view.km} onChange={(e) => set({ km: +e.target.value })} className="bbn-range" />
        </>
      )}

      <h2>{tool.listTitle}</h2>
      <ol className="bbn-list">
        {feats.map((p, i) => {
          const isSel = p.g === selected;
          const cls = [isSel ? "bbn-sel" : "", mark && !base.has(featureKey(p)) ? "bbn-new" : ""].join(" ");
          return (
            <li key={featureKey(p)} className={cls}>
              <button className="bbn-link" aria-pressed={isSel} onClick={() => onPick(isSel ? null : { tool: view.tool, p, rank: i + 1 })}>
                {toolName(p)}
              </button>{" "}
              <span className="bbn-muted">{"length_cumulative" in p ? `${(p.length / 1000).toFixed(1)} km` : "link_length" in p ? `${p.link_length} m` : `${p.length} m`}</span>
            </li>
          );
        })}
      </ol>

      <h2>Map layers</h2>
      {([
        ["protected", CLASS_COLOR.protected, shared ? "Protected paths today (+ shared sidewalks, light blue)" : "Protected paths today"],
        ["painted", CLASS_COLOR.painted, "Painted bike lanes"],
        ["crashes", CRASH_COLOR, `Bike crashes 2018–24 (${data.crashes.features.length})`],
        ["commutes", COMMUTE_COLOR, "Commutes within Boulder (2024)"],
      ] as const).map(([k, color, label]) => (
        <label className="bbn-check" key={k}>
          <input type="checkbox" checked={view.layers[k]} onChange={(e) => set({ layers: { ...view.layers, [k]: e.target.checked } })} />
          <span className={k === "crashes" ? "bbn-sw bbn-sw-dot" : "bbn-sw"} style={{ background: color }} />
          {label}
        </label>
      ))}

      <details className="bbn-adv">
        <summary>Advanced</summary>
        <h2>Recommendation method</h2>
        {TOOL_ORDER.map((t) => (
          <label className="bbn-check" key={t}>
            <input type="radio" name="bbn-tool" checked={view.tool === t} disabled={!data.tools[view.version][t]} onChange={() => set({ tool: t })} />
            <span className="bbn-sw" style={{ background: TOOLS[t].color }} />
            {TOOLS[t].label}
          </label>
        ))}
        {!data.tools[view.version].fix && <p className="bbn-muted">Gap closing isn't run with shared sidewalks counted.</p>}
        <h2>What counts as protected today</h2>
        <div className="bbn-seg">
          <button className={!shared ? "on" : ""} onClick={() => pickVersion(false, crashes)}>
            Bike facilities only
          </button>
          <button className={shared ? "on" : ""} onClick={() => pickVersion(true, crashes)}>
            + Shared sidewalks
          </button>
        </div>
        <h2>Data fed to the tools</h2>
        <div className="bbn-seg">
          <button className={!crashes ? "on" : ""} onClick={() => pickVersion(shared, false)}>
            None
          </button>
          <button className={crashes ? "on" : ""} onClick={() => pickVersion(shared, true)}>
            Crashes
          </button>
        </div>
        <p className="bbn-muted">{data.notes[view.version]}</p>
        {view.version !== DEFAULT_VERSION && (
          <label className="bbn-check">
            <input type="checkbox" checked={view.diff} onChange={(e) => set({ diff: e.target.checked })} />
            Highlight changes vs the default
          </label>
        )}
      </details>
    </>
  );
}
