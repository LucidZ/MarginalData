import { DEFAULT_VERSION, type NetworkData, type ToolId, type VersionId } from "./types";
import { CLASS_COLOR, CRASH_COLOR, M_PER_MI, REC_DARK, TOOLS, agreeLabel, fmtMi, toolLength, toolName } from "./style";
import { featureKey, isGrow, planFeatures, showsDiff, toolFeatures, type NetworkView, type Pick } from "./networkLayers";

interface Props {
  data: NetworkData;
  view: NetworkView;
  setView: (v: NetworkView) => void;
  selected: number | null;
  onPick: (pick: Pick | null) => void;
}

const TOOL_ORDER: ToolId[] = ["grow_existing", "agree", "fix", "link", "grow"];

/** Build-order slider: first N miles of a Grow run. */
export function BudgetSlider({ data, view, set }: { data: NetworkData; view: NetworkView; set: (patch: Partial<NetworkView>) => void }) {
  const all = toolFeatures(data, view.version, view.tool);
  const max = all.length ? Math.ceil((2 * (all[all.length - 1] as { length_cumulative: number }).length_cumulative) / M_PER_MI) / 2 : 70;
  const today = data.protected_m[view.version.startsWith("shared") ? "shared" : "bike"];
  const built = planFeatures(data, view).reduce((m, p) => m + ("length" in p ? p.length : 0), 0);
  return (
    <>
      <div className="bbn-muted">Show the first <b>{view.mi}</b> mi of build order</div>
      <input type="range" min={0.5} max={max} step={0.5} value={Math.min(view.mi, max)} onChange={(e) => set({ mi: +e.target.value })} className="bbn-range" />
      <div className="bbn-muted bbn-small">
        Boulder has {fmtMi(today)} mi of protected path today. This adds {fmtMi(built)} mi (+{Math.round((100 * built) / today)}%).
      </div>
    </>
  );
}

export default function NetworkPanel({ data, view, setView, selected, onPick }: Props) {
  const set = (patch: Partial<NetworkView>) => setView({ ...view, ...patch });
  const shared = view.version.startsWith("shared"), crashes = view.version.endsWith("_crashes");
  // Fix isn't run with shared sidewalks counted as protected
  const pickVersion = (s: boolean, c: boolean) =>
    set({ version: `${s ? "shared" : "bike"}${c ? "_crashes" : ""}` as VersionId, ...(s && view.tool === "fix" ? { tool: "grow_existing" } : {}) });
  const tool = TOOLS[view.tool];
  const of = data.tools[view.version][view.tool]?.of ?? 3;

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
      {view.tool === "agree" && (
        <div className="bbn-legend">
          <div><i className="bbn-sw" style={{ background: REC_DARK }} />{agreeLabel(of, of)}</div>
          <div><i className="bbn-sw" style={{ background: tool.color }} />{agreeLabel(2, of)}</div>
        </div>
      )}
      {isGrow(view.tool) && <BudgetSlider data={data} view={view} set={set} />}

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
              <span className="bbn-muted bbn-nowrap">
                {toolLength(p)}
                {"n" in p && p.n >= of ? " · all agree" : ""}
              </span>
            </li>
          );
        })}
      </ol>

      <h2>Map layers</h2>
      {([
        ["protected", CLASS_COLOR.protected, shared ? "Protected paths today (+ shared sidewalks, light blue)" : "Protected paths today"],
        ["painted", CLASS_COLOR.painted, "Painted bike lanes"],
        ["crashes", CRASH_COLOR, `Bike crashes 2018–24 (${data.crashes.features.length})`],
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
