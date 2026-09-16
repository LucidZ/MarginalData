export const fmtPct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
export const fmtPP = (v: number, digits = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}pp`;

/** Formats a thousands-of-people figure as millions, e.g. 8455 -> "8.5M". */
export const fmtM = (thousands: number, digits = 1) => `${(thousands / 1000).toFixed(digits)}M`;

/** Signed millions, for a missing/surplus vote count, e.g. -8455 -> "-8.5M". */
export const fmtMSigned = (thousands: number, digits = 1) => `${thousands >= 0 ? "+" : ""}${fmtM(thousands, digits)}`;
