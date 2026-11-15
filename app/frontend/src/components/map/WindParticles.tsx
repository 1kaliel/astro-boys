import { useEffect, useRef, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { WindField, advance } from "../../lib/windField";

/** One second of animation shows this many hours of flow: a time-lapse, said so in the legend. */
export const TIMELAPSE_HOURS_PER_SECOND = 6;
const MAX_AGE_FRAMES = 90;
const FADE = 0.07;
/** Particles on a big screen and on a phone; the live count adapts between a floor and these ceilings. */
const CEILING_DESKTOP = 2400;
const CEILING_PHONE = 1000;
const FLOOR = 350;
/** Frame time (ms) above which the density goes down, and below which it can come back up. */
const SLOW_MS = 26;
const FAST_MS = 18;

type Particle = { lon: number; lat: number; age: number };

type WindParticlesProps = {
  mapRef: RefObject<MapRef | null>;
  field: WindField;
  /** Color of the streaks (the `--viz-wind` token: pale cyan on the dark map, a deeper blue on the light one). */
  color: string;
};

/**
 * Streaks that follow the live wind field over the map (canvas on top of MapLibre, no library).
 *
 * The loop runs on its own `requestAnimationFrame`, outside React, and never asks the network for anything: it only
 * reads the field that is already in memory. Each streak is advected through the interpolated field, so the animation
 * shows the pattern of the current wind; it is not the path of an air parcel and it is faster than real time.
 * Streaks are born inside what is on screen (so zooming in does not thin them out) and only where the field is known;
 * brightness follows speed. The density adapts to the device: it drops when frames get slow and recovers when they do
 * not. The loop pauses when the tab is hidden and resumes when it is back. With reduced motion this component is not
 * mounted (the page shows static arrows instead).
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

    const ceiling = width < 600 ? CEILING_PHONE : CEILING_DESKTOP;
    let active = Math.round(ceiling * 0.7); // start below the ceiling and let the frame time decide
    // One buffer for the whole life of the layer: it is reused, never rebuilt, while the density moves.
    const particles: Particle[] = Array.from({ length: ceiling }, () => ({
      lon: field.west,
      lat: field.south,
      age: 0,
    }));

    /** Born anywhere on screen that the field covers; a spot with no value is retried, then left for the next frame. */
    const spawn = (particle: Particle) => {
      const bounds = map.getBounds();
      const west = Math.max(field.west, bounds.getWest());
      const east = Math.min(field.east, bounds.getEast());
      const south = Math.max(field.south, bounds.getSouth());
      const north = Math.min(field.north, bounds.getNorth());
      particle.age = Math.floor(Math.random() * MAX_AGE_FRAMES);
      if (west >= east || south >= north) return; // nothing of the field on screen: the streak waits
      for (let tries = 0; tries < 6; tries += 1) {
        const lon = west + Math.random() * (east - west);
        const lat = south + Math.random() * (north - south);
        if (field.sample(lon, lat)) {
          particle.lon = lon;
          particle.lat = lat;
          return;
        }
      }
    };
    particles.forEach(spawn);

    // A moved or zoomed map would smear old streaks: start the trails again and spread the streaks over the new view.
    const clear = () => ctx.clearRect(0, 0, width, height);
    const respawn = () => {
      clear();
      particles.forEach(spawn);
    };
    map.on("movestart", clear);
    map.on("move", clear);
    map.on("moveend", respawn);
    map.on("resize", resize);

    let frame = 0;
    let last = performance.now();
    let slow = 0;
    let fast = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const elapsed = now - last;
      const hours = Math.min(0.1, elapsed / 1000) * TIMELAPSE_HOURS_PER_SECOND;
      last = now;

      // Adaptive density: sustained slow frames shed 15% of the streaks, sustained fast ones win back 8%.
      if (elapsed > SLOW_MS) {
        slow += 1;
        fast = 0;
      } else if (elapsed < FAST_MS) {
        fast += 1;
        slow = 0;
      }
      if (slow >= 20) {
        active = Math.max(FLOOR, Math.round(active * 0.85));
        slow = 0;
      } else if (fast >= 120 && active < ceiling) {
        active = Math.min(ceiling, Math.round(active * 1.08));
        fast = 0;
      }

      // Fade the previous frames: the trail of each streak.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0, 0, 0, ${FADE})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      ctx.lineCap = "round";

      for (let i = 0; i < active; i += 1) {
        const p = particles[i];
        const wind = field.sample(p.lon, p.lat);
        p.age += 1;
        if (!wind || p.age > MAX_AGE_FRAMES) {
          spawn(p);
          continue;
        }
        const from = map.project([p.lon, p.lat]);
        [p.lon, p.lat] = advance(p.lon, p.lat, wind.u, wind.v, hours);
        const to = map.project([p.lon, p.lat]);
        if (from.x < -20 || from.y < -20 || from.x > width + 20 || from.y > height + 20) {
          p.age = MAX_AGE_FRAMES + 1; // it left the screen: it is born again inside it
          continue;
        }
        ctx.globalAlpha = 0.22 + 0.55 * Math.min(1, wind.speed / 40);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    frame = requestAnimationFrame(tick);

    // Resumes by itself when the tab comes back: no click, no switch.
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) {
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
      map.off("moveend", respawn);
      map.off("resize", resize);
    };
  }, [mapRef, field, color]);

  return <canvas ref={canvasRef} className="wind-canvas" aria-hidden="true" />;
}
