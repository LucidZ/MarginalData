import { useEffect } from "react";
import L from "leaflet";
import type { PhotoTarget } from "./types";
import { streetViewUrl } from "./streetview";
import { osmNoteUrl, osmQueryUrl } from "./osm";

interface Props {
  map: L.Map | null;
  target: PhotoTarget;
  onClose: () => void;
}

export default function StreetViewPanel({ map, target, onClose }: Props) {
  // Mark the clicked spot
  useEffect(() => {
    if (!map) return;
    const c = L.circleMarker([target.lat, target.lng], { radius: 6, color: "#111", weight: 2, fill: false, interactive: false }).addTo(map);
    return () => {
      c.remove();
    };
  }, [map, target]);

  const { lat, lng, bearing } = target;
  return (
    <div className="bbn-photo">
      <div className="bbn-photo-head">
        <b>{target.title}</b>
        <button className="bbn-photo-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="bbn-photo-ctl">
        <a href={streetViewUrl(lat, lng, bearing)} target="_blank" rel="noopener noreferrer">
          Street View ↗
        </a>
        {bearing !== null && (
          <a href={streetViewUrl(lat, lng, (bearing + 180) % 360)} target="_blank" rel="noopener noreferrer">
            Facing the other way ↗
          </a>
        )}
      </div>
      <div className="bbn-osm">
        <span>Looks wrong? The map data is from OpenStreetMap:</span>
        <div className="bbn-photo-ctl">
          <a href={osmQueryUrl(lat, lng)} target="_blank" rel="noopener noreferrer">See the data ↗</a>
          <a href={osmNoteUrl(lat, lng)} target="_blank" rel="noopener noreferrer">Leave a note ↗</a>
        </div>
      </div>
    </div>
  );
}
