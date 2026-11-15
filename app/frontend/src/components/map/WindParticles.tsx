import { useEffect, useRef, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { WindField, advance } from "../../lib/windField";

/** One second of animation shows this many hours of flow: a time-lapse, said so in the legend. */
export const TIMELAPSE_HOURS_PER_SECOND = 6;
const MAX_AGE_FRAMES = 90;
const FADE = 0.07;

type Particle = { lon: number; lat: number; age: number };

type WindParticlesProps = {
  mapRef: RefObject<MapRef | null>;
  field: WindField;
  /** Color of the streaks (the page ink, so they read on both basemaps). */
  color: string;
};

/**
 * Streaks that follow the live wind field over the map (canvas on top of MapLibre, no library).
 *
 * Each streak is advected through the interpolated field, so the animation shows the pattern of the current wind. It is
 * not the path of an air parcel and it is faster than real time. Streaks only live where the field is known, and
 * brightness follows speed. The layer pauses when the tab is hidden and is not mounted when the user prefers reduced
 * motion (the page shows static arrows then).
 */
export function WindParticles({ mapRef, field, color }: WindParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const map = mapRef.current?.getMap();
    const ctx = canvas?.getContext("2d");
    if (!canvas || !map || !ctx || !field.usable) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
    };
    resize();

    const count = width < 600 ? 900 : 2200;
    const spawn = (particle: Particle) => {
      // Anywhere the field is known (inside the clip, if any); a spot with no value is retried a few times, then left
      // for the next frame.
      const box = field.spawnBounds;
      for (let tries = 0; tries < 10; tries += 1) {
        const lon = box.west + Math.random() * (box.east - box.west);
        const lat = box.south + Math.random() * (box.north - box.south);
        if (field.sample(lon, lat)) {
          particle.lon = lon;
          particle.lat = lat;
          break;
        }
      }
      particle.age = Math.floor(Math.random() * MAX_AGE_FRAMES);
    };
    const particles: Particle[] = Array.from({ length: count }, () => {
      // Starts with no position: if no spot is found, sample() is null and it is spawned again next frame.
      const p = { lon: Number.NaN, lat: Number.NaN, age: 0 };
      spawn(p);
      return p;
    });

    // A moved or zoomed map would smear old streaks: start the trails again.
    const clear = () => ctx.clearRect(0, 0, width, height);
    map.on("movestart", clear);
    map.on("move", clear);
    map.on("resize", resize);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const hours = Math.min(0.1, (now - last) / 1000) * TIMELAPSE_HOURS_PER_SECOND;
      last = now;
      // Fade the previous frames: the trail of each streak.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0, 0, 0, ${FADE})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";

      for (const p of particles) {
        const wind = field.sample(p.lon, p.lat);
        p.age += 1;
        if (!wind || p.age > MAX_AGE_FRAMES) {
          spawn(p);
          continue;
        }
        const from = map.project([p.lon, p.lat]);
        [p.lon, p.lat] = advance(p.lon, p.lat, wind.u, wind.v, hours);
        const to = map.project([p.lon, p.lat]);
        if (from.x < -20 || from.y < -20 || from.x > width + 20 || from.y > height + 20) continue;
        ctx.globalAlpha = 0.25 + 0.65 * Math.min(1, wind.speed / 40);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    frame = requestAnimationFrame(tick);

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      map.off("movestart", clear);
      map.off("move", clear);
      map.off("resize", resize);
    };
  }, [mapRef, field, color]);

  return <canvas ref={canvasRef} className="wind-canvas" aria-hidden="true" />;
}
