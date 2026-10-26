import { format } from "d3";

export const fmtInt = format(",.0f");
export const fmtCompact = (v: number) => (v >= 1000 ? `${format(".3~s")(v).replace("k", "K")}` : fmtInt(v));

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });

export const fmtInches = (v: number | null) => (v == null ? "n/a" : `${v}"`);

export const hourLabel = (h: number) => {
  const hh = h % 24;
  if (hh === 0) return "12a";
  if (hh === 12) return "12p";
  return hh < 12 ? `${hh}a` : `${hh - 12}p`;
};
