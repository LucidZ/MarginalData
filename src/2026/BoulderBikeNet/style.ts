import type { BikeClass, ProfileId, SidewalkPref, ToolId, ToolProps } from "./types";

export const CLASS_COLOR: Record<BikeClass, string> = {
  protected: "#2f6fb3",
  "shared path/sidewalk": "#7fb2e0",
  painted: "#e9a23b",
  "quiet street": "#8a8f98",
  "busy street": "#d62728",
  "path/sidewalk (untagged)": "#9b59b6",
  dismount: "#7a4a1e",
};

export const CLASS_LABEL: Record<BikeClass, string> = {
  protected: "Protected path / track",
  "shared path/sidewalk": "Sidewalk or walking path, bikes allowed",
  painted: "Painted bike lane",
  "quiet street": "Quiet street, no lane",
  "busy street": "Busy street, no lane",
  "path/sidewalk (untagged)": "Path, bike access unknown",
  dismount: "Walk your bike (no riding)",
};

// One color for every recommendation method: distinct from protected blue, painted amber,
// and crash magenta
export const REC_COLOR = "#16a34a";
export const REC_DARK = "#0f6b30"; // agree: stretches every method picked

// Plain-language names first; the BikeNetKit tool name goes in the description
export const TOOLS: Record<ToolId, { label: string; listTitle: string; desc: string; color: string }> = {
  grow_existing: {
    label: "Extend today's network",
    listTitle: "First 10 links to build",
    desc: "GrowBikeNet, extending what exists: adds protected links one at a time, most useful first, starting from Boulder's current paths.",
    color: REC_COLOR,
  },
  grow: {
    label: "Build from scratch",
    listTitle: "First 10 links to build",
    desc: "GrowBikeNet from scratch: the order an ideal network would be built in if nothing existed yet.",
    color: REC_COLOR,
  },
  fix: {
    label: "Close the worst gaps",
    listTitle: "Top 10 gaps",
    desc: "FixBikeNet: short missing pieces between protected paths, ranked by how much riding they'd unlock.",
    color: REC_COLOR,
  },
  link: {
    label: "Connect isolated pieces",
    listTitle: "First 10 connections",
    desc: "LinkBikeNet: the shortest links that join stranded stretches of path to the main network.",
    color: REC_COLOR,
  },
  agree: {
    label: "Where the methods agree",
    listTitle: "Stretches they agree on",
    desc: "Streets picked by at least two of Extend, Close the gaps and Connect. Dark green: all of them.",
    color: REC_COLOR,
  },
};

export const DEFAULT_TOOL: ToolId = "grow_existing";

export const ACCENT = "#e8590c"; // "new vs default"
export const CRASH_COLOR = "#c2255c";

export const PROFILES: Record<ProfileId, { name: string; short: string; desc: string }> = {
  direct: {
    name: "Direct",
    short: "near-shortest",
    desc: "Close to the shortest route, but takes a bike path or lane when one runs alongside for about the same distance.",
  },
  balanced: {
    name: "Balanced",
    short: "avoids busy streets",
    desc: "A busy street without a lane counts as 3× its length; painted lanes and quiet streets cost a little extra.",
  },
  cautious: {
    name: "Cautious",
    short: "protected first",
    desc: "A busy street without a lane counts as 6× its length; stays on protected paths even for longer detours.",
  },
};

export const SIDEWALK_PREFS: Record<SidewalkPref, { name: string; desc: string }> = {
  road: {
    name: "The road",
    desc: "Bike lanes and quiet streets first. Sidewalks are used only where they're the better way through.",
  },
  sidewalk: {
    name: "The sidewalk",
    desc: "Sidewalks and walking paths where bikes are allowed count like a bike path: off the road, but slower, with people on foot.",
  },
};

export const SPEED_MPH = 10;

export const M_PER_MI = 1609.344;
const FT_PER_M = 3.28084;

/** A distance in metres for display: feet under a tenth of a mile, miles above. */
export function fmtLen(m: number): string {
  if (m < M_PER_MI / 10) return `${Math.max(10, Math.round((m * FT_PER_M) / 10) * 10).toLocaleString()} ft`;
  return `${(m / M_PER_MI).toFixed(1)} mi`;
}

export const fmtMi = (m: number) => (m / M_PER_MI).toFixed(1);

/** Minutes to ride `m` metres at SPEED_MPH. */
export const rideMin = (m: number) => Math.max(1, Math.round((m / M_PER_MI / SPEED_MPH) * 60));

/** Display name of one recommendation; `rank` is its 1-based position in build order. */
export function toolName(p: ToolProps): string {
  return "name" in p ? p.name : p.streets;
}

export function toolTitle(tool: ToolId, p: ToolProps, rank: number): string {
  const what = tool === "fix" ? "Gap" : tool === "link" ? "Connection" : tool === "agree" ? "Stretch" : "Link";
  return `${what} #${rank}: ${toolName(p)}`;
}

/** Length shown next to a recommendation in the list. */
export function toolLength(p: ToolProps): string {
  return fmtLen("link_length" in p ? p.link_length : p.length);
}

/** "All 3 methods" / "2 of 3 methods" for an agreement stretch. */
export const agreeLabel = (n: number, of: number) => (n >= of ? `All ${of} methods` : `${n} of ${of} methods`);

export function toolTooltip(tool: ToolId, p: ToolProps, rank: number, of = 3): string {
  const lines = [toolTitle(tool, p, rank)];
  if ("benefit" in p) lines.push(`${fmtLen(p.length)} missing`);
  if ("length_cumulative" in p) lines.push(`${fmtLen(p.length)} · ${fmtMi(p.length_cumulative)} mi built by this point`);
  if ("share_after" in p) lines.push(`${fmtLen(p.link_length)} · ${p.share_after}% of paths connected after this`);
  if ("n" in p) lines.push(`${fmtLen(p.length)} · ${agreeLabel(p.n, of)}`);
  return lines.join("<br>");
}
