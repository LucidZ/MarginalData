import type { Station } from "./types";

interface CurvesLegendProps {
  stations: Station[];
}

// One legend for every curves panel: station order west to east, each
// swatch a two-tone chip (westbound hue / eastbound hue) at that step.
export default function CurvesLegend({ stations }: CurvesLegendProps) {
  return (
    <ul className="i70-legend">
      {stations.map((s, i) => (
        <li key={s.id}>
          <span className={`i70-swatch i70-wb-${i + 1}`} />
          <span className={`i70-swatch i70-eb-${i + 1}`} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}
