import { format } from "d3";

export const fmtCount = format(",");

export const hourLabel = (h: number) => {
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
};

// Short form for axis ticks: "6a", "12p".
export const hourTick = (h: number) => {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? "a" : "p"}`;
};

export const dateLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
