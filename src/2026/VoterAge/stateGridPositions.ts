// Tile-grid row/col for each state + DC, used by StateGrid.tsx.
//
// Generated (not hand-placed) from each jurisdiction's real geographic
// centroid, snapped to a 9-row x 15-col grid, with collisions resolved by
// a LOCAL spiral search only (max radius 3 cells) - a state can never be
// dragged across the map to fill a distant open cell, which is what makes
// this safe to trust without re-deriving it by eye. AK/HI get the
// conventional bottom-left corner slots rather than their true (off-frame)
// position, matching how every published US tile-grid map handles them.
// See .claude/voter-age-spec.md S7 and the derivation script referenced
// there for the generation method.
export const GRID_ROWS = 9;
export const GRID_COLS = 15;

export const STATE_GRID_POS: Record<string, { row: number; col: number }> = {
  WASHINGTON: { row: 0, col: 1 },
  MONTANA: { row: 0, col: 4 },
  "NORTH DAKOTA": { row: 0, col: 6 },
  MINNESOTA: { row: 0, col: 7 },
  VERMONT: { row: 0, col: 12 },
  MAINE: { row: 0, col: 13 },
  OREGON: { row: 1, col: 1 },
  IDAHO: { row: 1, col: 2 },
  WYOMING: { row: 1, col: 4 },
  "SOUTH DAKOTA": { row: 1, col: 6 },
  WISCONSIN: { row: 1, col: 8 },
  MICHIGAN: { row: 1, col: 9 },
  INDIANA: { row: 1, col: 10 },
  "NEW YORK": { row: 1, col: 12 },
  "NEW HAMPSHIRE": { row: 1, col: 13 },
  MASSACHUSETTS: { row: 1, col: 14 },
  NEBRASKA: { row: 2, col: 6 },
  IOWA: { row: 2, col: 8 },
  ILLINOIS: { row: 2, col: 9 },
  OHIO: { row: 2, col: 10 },
  PENNSYLVANIA: { row: 2, col: 11 },
  "NEW JERSEY": { row: 2, col: 12 },
  CONNECTICUT: { row: 2, col: 13 },
  "RHODE ISLAND": { row: 2, col: 14 },
  CALIFORNIA: { row: 3, col: 1 },
  NEVADA: { row: 3, col: 2 },
  UTAH: { row: 3, col: 3 },
  COLORADO: { row: 3, col: 5 },
  KANSAS: { row: 3, col: 6 },
  MISSOURI: { row: 3, col: 8 },
  KENTUCKY: { row: 3, col: 10 },
  "DISTRICT OF COLUMBIA": { row: 3, col: 11 },
  VIRGINIA: { row: 3, col: 12 },
  DELAWARE: { row: 3, col: 13 },
  "NEW MEXICO": { row: 4, col: 5 },
  OKLAHOMA: { row: 4, col: 7 },
  ARKANSAS: { row: 4, col: 8 },
  TENNESSEE: { row: 4, col: 9 },
  "WEST VIRGINIA": { row: 4, col: 10 },
  MARYLAND: { row: 4, col: 11 },
  "NORTH CAROLINA": { row: 4, col: 12 },
  ARIZONA: { row: 5, col: 3 },
  TEXAS: { row: 5, col: 6 },
  MISSISSIPPI: { row: 5, col: 8 },
  ALABAMA: { row: 5, col: 9 },
  GEORGIA: { row: 5, col: 10 },
  "SOUTH CAROLINA": { row: 5, col: 11 },
  LOUISIANA: { row: 6, col: 8 },
  FLORIDA: { row: 7, col: 10 },
  ALASKA: { row: 8, col: 0 },
  HAWAII: { row: 8, col: 1 },
};
