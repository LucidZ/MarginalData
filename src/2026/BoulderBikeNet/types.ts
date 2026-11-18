// Mirrors public/data/boulder-bikenet/*.json, produced by
// scripts/boulder_bikenet/export_site_data.py.
import type { FeatureCollection, Geometry, LineString, MultiLineString, Point } from "geojson";

export type VersionId = "v0" | "v1" | "v2" | "v3" | "v4";
export type ToolId = "fix" | "link" | "grow" | "grow_existing";

export interface FixProps { g: number; key: string; ordering: number; name: string; length: number; benefit: number }
export interface LinkProps { g: number; ordering: number; link_length: number; share_after: number; streets: string }
export interface GrowProps { g: number; key: string; ordering: number; streets: string; length: number; length_cumulative: number }
export type ToolProps = FixProps | LinkProps | GrowProps;

export interface NetworkData {
  versions: Record<VersionId, string>;
  notes: Record<VersionId, string>;
  differs: Record<VersionId, ToolId[]>;
  tools: Record<VersionId, Partial<Record<ToolId, { src: VersionId; features: ToolProps[] }>>>;
  geoms: (LineString | MultiLineString)[];
  painted: FeatureCollection<LineString | MultiLineString, { name: string }>;
  protected: FeatureCollection<LineString | MultiLineString>;
  protected_v0: FeatureCollection<LineString | MultiLineString>;
  boundary: FeatureCollection<Geometry>;
  crashes: FeatureCollection<Point, { year: number; severity: string }>;
  commutes: FeatureCollection<LineString, { workers: number }>;
  commute_total: number;
}

export type BikeClass = "protected" | "painted" | "quiet street" | "busy street" | "path/sidewalk (untagged)";
export type ProfileId = "direct" | "balanced" | "cautious";

export interface GraphData {
  xy: number[]; // node x,y in micro-degrees
  e: number[]; // 5 per edge: a, b, length*10, flags (class | arterial<<3 | oneway<<4 | mixed<<6), name index
  so: number[]; // shape offsets per edge
  sp: number[]; // interior shape points, micro-degrees, oriented a -> b
  names: string[];
  classes: BikeClass[];
  profiles: Record<ProfileId, Record<string, number>>;
  osm_source: string;
}

// What the photo panel is pointed at: a spot, plus the street direction there when known.
export interface PhotoTarget {
  lat: number;
  lng: number;
  bearing: number | null;
  title: string;
}
