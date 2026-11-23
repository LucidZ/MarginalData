// Mirrors public/data/boulder-bikenet/*.json, produced by
// scripts/boulder_bikenet/export_site_data.py.
import type { FeatureCollection, Geometry, LineString, MultiLineString, Point } from "geojson";

// What counts as protected (bike facilities only / + shared sidewalks) x data fed to the tools
export type VersionId = "bike" | "bike_crashes" | "shared" | "shared_crashes";
export const DEFAULT_VERSION: VersionId = "bike";
// "agree": stretches picked by at least two of grow_existing / fix / link (export_site_data.agreement)
export type ToolId = "fix" | "link" | "grow" | "grow_existing" | "agree";

export interface FixProps { g: number; key: string; ordering: number; name: string; length: number; benefit: number }
export interface LinkProps { g: number; ordering: number; link_length: number; share_after: number; streets: string }
export interface GrowProps { g: number; key: string; ordering: number; streets: string; length: number; length_cumulative: number }
export interface AgreeProps { g: number; ordering: number; n: number; streets: string; length: number }
export type ToolProps = FixProps | LinkProps | GrowProps | AgreeProps;

export interface NetworkData {
  versions: Record<VersionId, string>;
  notes: Record<VersionId, string>;
  differs: Record<VersionId, ToolId[]>;
  tools: Record<VersionId, Partial<Record<ToolId, { src: VersionId; features: ToolProps[]; of?: number }>>>; // of: methods compared (agree)
  geoms: (LineString | MultiLineString)[];
  painted: FeatureCollection<LineString | MultiLineString, { name: string }>;
  protected: FeatureCollection<LineString | MultiLineString>;
  protected_shared: FeatureCollection<LineString | MultiLineString>; // added in the "shared" versions
  protected_m: { bike: number; shared: number }; // protected length today behind each baseline
  boundary: FeatureCollection<Geometry>;
  crashes: FeatureCollection<Point, { year: number; severity: string }>;
}

export type BikeClass = "protected" | "shared path/sidewalk" | "painted" | "quiet street" | "busy street" | "path/sidewalk (untagged)" | "dismount";
export type ProfileId = "direct" | "balanced" | "cautious";
export type SidewalkPref = "road" | "sidewalk";

export interface GraphData {
  xy: number[]; // node x,y in micro-degrees
  e: number[]; // 5 per edge: a, b, length*10, flags (class | arterial<<3 | oneway<<4 | mixed<<6), name index
  so: number[]; // shape offsets per edge
  sp: number[]; // interior shape points, micro-degrees, oriented a -> b
  names: string[];
  classes: BikeClass[];
  profiles: Record<ProfileId, Record<string, number>>;
  osm_source: string;
  plan: number[][]; // per NetworkData.geoms entry: the edges under that recommendation
}

// What the photo panel is pointed at: a spot, plus the street direction there when known.
export interface PhotoTarget {
  lat: number;
  lng: number;
  bearing: number | null;
  title: string;
}
