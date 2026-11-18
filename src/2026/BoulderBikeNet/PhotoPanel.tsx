import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import type { PhotoTarget } from "./types";
import { MLY_TOKEN, angDiff, findPhotos, rankPhotos, type MlyImage } from "./photos";

const M_LAT = 110540;
const M_LON = 111320 * Math.cos((40.015 * Math.PI) / 180);

interface Props {
  map: L.Map | null;
  target: PhotoTarget;
  onClose: () => void;
}

export default function PhotoPanel({ map, target, onClose }: Props) {
  const [imgs, setImgs] = useState<MlyImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState<boolean | null>(null); // null = let the ranking choose
  const [i, setI] = useState(0);

  useEffect(() => {
    setImgs(null);
    setError(null);
    setFlipped(null);
    setI(0);
    if (!MLY_TOKEN) return;
    const ctl = new AbortController();
    findPhotos(target.lat, target.lng, ctl.signal)
      .then(setImgs)
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctl.abort();
  }, [target]);

  const ranked = useMemo(() => {
    if (!imgs?.length) return null;
    const auto = rankPhotos(imgs, target.bearing, false, undefined, true);
    if (flipped === null || flipped === auto.flipped) return auto;
    const first = rankPhotos(imgs, target.bearing, false).list[0];
    return rankPhotos(imgs, target.bearing, flipped, first);
  }, [imgs, target, flipped]);

  const m = ranked?.list[i];

  // Clicked spot, plus where the shown photo was taken and which way it faces
  useEffect(() => {
    if (!map) return;
    const g = L.layerGroup().addTo(map);
    L.circleMarker([target.lat, target.lng], { radius: 6, color: "#111", weight: 2, fill: false, interactive: false }).addTo(g);
    if (m) {
      const [lon, lat] = m.at, a = (m.angle * Math.PI) / 180, r = 18;
      if (!m.is_pano)
        L.polyline([[lat, lon], [lat + (Math.cos(a) * r) / M_LAT, lon + (Math.sin(a) * r) / M_LON]], { color: "#111", weight: 3, interactive: false }).addTo(g);
      L.circleMarker([lat, lon], { radius: 5, color: "#fff", weight: 1.5, fillColor: "#111", fillOpacity: 1, interactive: false }).addTo(g);
    }
    return () => {
      g.remove();
    };
  }, [map, target, m]);

  let body: React.ReactNode;
  if (!MLY_TOKEN) body = "Street photos need VITE_MAPILLARY_TOKEN in .env.local.";
  else if (error) body = `Photo lookup failed: ${error}`;
  else if (!imgs) body = "Looking for photos…";
  else if (!m || !ranked) body = "No street-level photos within 50 m.";
  else body = <img alt="Street-level photo from Mapillary" src={m.thumb_1024_url} />;

  let meta = "";
  if (m && ranked) {
    const when = new Date(m.captured_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    const off = ranked.want === null ? "" : ranked.aligned(m)
      ? (target.bearing === null ? " (opposite view)" : " (along the street)")
      : ` (${Math.round(angDiff(m.angle, ranked.want))}° off ${target.bearing === null ? "the opposite view" : "the street"})`;
    const facing = m.is_pano ? "360° panorama" : `facing ${Math.round(m.angle)}°${off}`;
    const none = ranked.want !== null && !ranked.aligned(ranked.list[0]) ? "No flat photo faces this way nearby. " : "";
    meta = `${none}${when} · ${Math.round(m.d)} m away · ${facing}`;
  }

  return (
    <div className="bbn-photo">
      <div className="bbn-photo-head">
        <b>{target.title}</b>
        <button className="bbn-photo-close" onClick={onClose} aria-label="Close photo">×</button>
      </div>
      <div className="bbn-photo-img">{body}</div>
      {m && ranked && (
        <>
          <div className="bbn-muted bbn-photo-meta">{meta}</div>
          <div className="bbn-photo-ctl">
            <button disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous photo">‹</button>
            <span className="bbn-muted">{i + 1} / {ranked.list.length}</span>
            <button disabled={i === ranked.list.length - 1} onClick={() => setI(i + 1)} aria-label="Next photo">›</button>
            <button onClick={() => { setFlipped(!ranked.flipped); setI(0); }}>Look the other way</button>
            <a href={`https://www.mapillary.com/app/?pKey=${m.id}&focus=photo`} target="_blank" rel="noopener noreferrer">Mapillary ↗</a>
          </div>
          <div className="bbn-muted bbn-photo-attr">© {m.creator?.username || "contributor"}, Mapillary, CC-BY-SA</div>
        </>
      )}
    </div>
  );
}
