import { format } from "d3";
import type { CounterId, Direction } from "./types";

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

// "wb" is the direction away from Denver on every counter. US-40 runs north
// over Berthoud Pass, so there it's northbound.
const DIR_WORDS: Record<CounterId, Record<Direction, string>> = {
  twin: { wb: "westbound", eb: "eastbound" },
  tunnel: { wb: "westbound", eb: "eastbound" },
  berthoud: { wb: "northbound", eb: "southbound" },
};

export const dirWord = (counter: CounterId, dir: Direction) => DIR_WORDS[counter][dir];
export const dirLabel = (counter: CounterId, dir: Direction) => {
  const w = dirWord(counter, dir);
  return w.charAt(0).toUpperCase() + w.slice(1);
};
