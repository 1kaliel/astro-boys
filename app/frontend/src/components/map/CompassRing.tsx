import { useEffect, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

type CompassRingProps = { mapRef: RefObject<MapRef | null> };

/**
 * A compass ring drawn around the map, tilted like the ground (the pitch of the map) and turned with its bearing.
 * It is a drawing, not data: it only helps to read the direction when the map is rotated and tilted. It does not
 * catch the pointer.
 */
export function CompassRing({ mapRef }: CompassRingProps) {
  const [view, setView] = useState({ bearing: 0, pitch: 0 });

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const update = () => setView({ bearing: map.getBearing(), pitch: map.getPitch() });
    update();
    map.on("rotate", update);
    map.on("pitch", update);
    map.on("moveend", update);
    return () => {
      map.off("rotate", update);
      map.off("pitch", update);
      map.off("moveend", update);
    };
  }, [mapRef]);

  return (
    <div className="compass" aria-hidden="true" style={{ transform: `perspective(1100px) rotateX(${view.pitch}deg)` }}>
      <svg viewBox="-100 -100 200 200" style={{ transform: `rotate(${-view.bearing}deg)` }}>
        <circle className="compass-ring" r="92" />
        <circle className="compass-ring compass-ring-inner" r="78" />
        {Array.from({ length: 72 }, (_, i) => (
          <line
            key={i}
            className={i % 9 === 0 ? "compass-tick compass-tick-major" : "compass-tick"}
            x1="0"
            y1={-92}
            x2="0"
            y2={i % 9 === 0 ? -84 : -88}
            transform={`rotate(${i * 5})`}
          />
        ))}
        {POINTS.map((label, i) => (
          <g key={label} transform={`rotate(${i * 45}) translate(0 -68)`}>
            {/* Turned back against the ring and the map, so the letters stay upright on the screen. */}
            <text
              className={label.length === 1 ? "compass-label compass-label-main" : "compass-label"}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${view.bearing - i * 45})`}
            >
              {label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
