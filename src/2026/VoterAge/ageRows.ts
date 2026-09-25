import type { PopulationBarRow } from "./PopulationBars";
import type { AgeRow } from "./types";

/** One age row as a PopulationBars row, keyed `age-N` so d3 tweens a bar in
 * place across any dataset swap that keeps the same ages. Shared by the
 * beats (AgeBeats.tsx) and the explorer (Explorer.tsx). */
export function toBarRow(row: AgeRow): PopulationBarRow {
  return {
    key: `age-${row.age}`,
    x: row.age,
    label: row.age === 100 ? "100+" : String(row.age),
    cvap: row.cvap,
    votes: row.votes,
    expected: row.expected, // this cycle's own 65+ rate x cvap
    missing: row.missing,
    turnout: row.turnout,
    ratesPooled: row.ratesPooled,
    registered: row.registered,
    expectedRegistered: row.expectedRegistered,
  };
}
