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
  "path/sidewalk (untagged)": "Path or sidewalk (bike access untagged)",
  dismount: "Walk your bike (no riding)",
};

// One color for every recommendation method: distinct from protected blue, painted amber,
// crash magenta and commute purple
export const REC_COLOR = "#16a34a";

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
};

export const DEFAULT_TOOL: ToolId = "grow_existing";

export const ACCENT = "#e8590c"; // "new vs default"
export const CRASH_COLOR = "#c2255c";
export const COMMUTE_COLOR = "#5f3dc4";

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

export const SPEED_KMH = 16;

/** Display name of one recommendation; `rank` is its 1-based position in build order. */
export function toolName(p: ToolProps): string {
  return "name" in p ? p.name : p.streets;
}

export function toolTitle(tool: ToolId, p: ToolProps, rank: number): string {
  const what = tool === "fix" ? "Gap" : tool === "link" ? "Connection" : "Link";
  return `${what} #${rank}: ${toolName(p)}`;
}

export function toolTooltip(tool: ToolId, p: ToolProps, rank: number): string {
  const lines = [toolTitle(tool, p, rank)];
  if ("benefit" in p) lines.push(`${p.length} m missing`);
  if ("length_cumulative" in p) lines.push(`${(p.length / 1000).toFixed(1)} km · ${(p.length_cumulative / 1000).toFixed(1)} km built by this point`);
  if ("share_after" in p) lines.push(`${p.link_length} m · ${p.share_after}% of paths connected after this`);
  return lines.join("<br>");
}
