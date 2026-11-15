/**
 * Skyline: a year of daily hotspot detections as a heat map that folds into an isometric skyline, and back.
 *
 * It is one scene, not two charts: every day is a box on a grid. The flat view looks straight down; the 3D view is
 * the same grid from a corner, and switching views swings the camera while each week's bars rise in a wave, oldest
 * week first. Hover or tap a day for its count; the arrow keys walk the grid. Only the detections it is given are drawn:
 * there is no sample data. Colours are the hotspot ramp (magma) of the project.
 *
 * Adapted from "GitHub Contribution Graph 3D Heatmap" by Kedhareswer Naidu (21st.dev), MIT License. See lib/skyline.ts
 * and docs/resources.md.
 */
import * as React from "react";
import {
  buildGrid,
  computeStats,
  depthOf,
  DAY_MS,
  barHeight,
  camera,
  dayMs,
  easeInOutCubic,
  lerp,
  monthLabels,
  project,
  riseAt,
  smoothstep,
  WAVE,
  type Cam,
  type DayCount,
} from "../../lib/skyline";
import { prefersReducedMotion } from "../../lib/hooks";
import { Button } from "../ui/Button";

export type SkylineView = "2d" | "3d";

/**
 * Four colours per theme, from the lightest detection level to the heaviest, as the design tokens of the hotspot ramp
 * (magma): components use tokens, never raw values. They are resolved to colours when the view is drawn.
 */
export const SKYLINE_PALETTE = {
  light: ["--magma-200", "--magma-300", "--magma-500", "--magma-700"],
  dark: ["--magma-600", "--magma-500", "--magma-300", "--magma-100"],
};

export interface SkylineProps {
  /** One entry per day (`YYYY-MM-DD`), counts of the chosen sensor. Repeated dates add up. */
  days: readonly DayCount[];
  /** Last day shown (`YYYY-MM-DD`). The grid covers the 365 days up to it. */
  endDate: string;
  /** Noun for one detection, and its plural. */
  unit?: string;
  unitPlural?: string;
  /** Heading. */
  title?: string;
  /** Starting view. */
  defaultView?: SkylineView;
  locale?: string;
  /** A line under the chart, e.g. the sensor and the period. */
  footer?: React.ReactNode;
}

type Rgb = [number, number, number];
const FG_FALLBACK: Rgb = [23, 23, 23];
const BG_FALLBACK: Rgb = [255, 255, 255];

let probe: CanvasRenderingContext2D | null = null;
/** Any CSS colour → sRGB by letting the browser paint it (so oklch, color-mix and names all work). */
const toRgb = (color: string, fallback: Rgb | null): Rgb | null => {
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return fallback;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "rgba(0,0,0,0)";
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  if (d[3] < 8) return fallback;
  return [d[0], d[1], d[2]];
};
const rgb = (c: Rgb, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const luminance = (c: Rgb) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/** The four corners of a box's top face, or its side faces, as flat [x, y] pairs. */
const quad = (ctx: CanvasRenderingContext2D, p: number[]) => {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]);
  ctx.closePath();
};

export default function ContributionSkyline({
  days,
  endDate,
  unit = "hotspot detection",
  unitPlural,
  title,
  defaultView = "2d",
  locale = "en-US",
  footer,
}: SkylineProps) {
  const plural = unitPlural ?? unit + "s";
  const endMs = dayMs(endDate);
  const model = React.useMemo(() => {
    const grid = buildGrid(days, endMs, 0);
    return { ...grid, stats: computeStats(grid.cells), months: monthLabels(grid.cells, grid.weeks, locale) };
  }, [days, endMs, locale]);

  const nf = React.useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const dfl = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
    [locale],
  );
  const dfs = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
    [locale],
  );
  const noun = (n: number) => (n === 1 ? unit : plural);
  const describe = (i: number) => {
    const c = model.cells[i];
    if (!c) return "";
    return (c.count ? `${nf.format(c.count)} ${noun(c.count)}` : `No ${plural}`) + " on " + dfl.format(dayMs(c.date));
  };

  const [view, setView] = React.useState<SkylineView>(defaultView);
  const [active, setActive] = React.useState(-1);
  const [announce, setAnnounce] = React.useState("");
  const stageRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const tipRef = React.useRef<HTMLDivElement>(null);
  const goal = React.useRef(0);
  const kickRef = React.useRef<() => void>(() => undefined);
  const activeRef = React.useRef(-1);
  const pinnedRef = React.useRef(-1);

  // Everything the loop reads, refreshed each render so the loop never closes over stale props.
  const live = React.useRef({ model, describe, setActive, setAnnounce });
  live.current = { model, describe, setActive, setAnnounce };

  React.useEffect(() => {
    goal.current = view === "3d" ? 1 : 0;
    kickRef.current();
  }, [view]);

  React.useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const tip = tipRef.current;
    if (!stage || !canvas || !tip) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    let t = goal.current === 1 ? 1 : 0;
    let raf = 0;
    let last = 0;
    let W = 0;
    let H2 = 0;
    let H3 = 0;
    let Hmax = 0;
    let dpr = 1;
    let n = 0;
    let weeks = 0;
    let wk = new Float32Array(0);
    let dy = new Float32Array(0);
    let lv = new Uint8Array(0);
    let hgt = new Float32Array(0);
    let zs = new Float32Array(0);
    let hov = new Float32Array(0);
    let quads = new Float32Array(0);
    let order: number[] = [];
    let fg: Rgb = FG_FALLBACK;
    let bg: Rgb = BG_FALLBACK;
    let palette: Rgb[] = [];
    let empty: Rgb = FG_FALLBACK;
    let font = "400 11px sans-serif";
    let muted: Rgb = FG_FALLBACK;
    let gutter = 30;
    let labelW = 30;
    let hovered = -1;
    let tipW = 0;

    const load = () => {
      const m = live.current.model;
      n = m.cells.length;
      weeks = m.weeks;
      wk = new Float32Array(n);
      dy = new Float32Array(n);
      lv = new Uint8Array(n);
      hgt = new Float32Array(n);
      zs = new Float32Array(n);
      hov = new Float32Array(n);
      quads = new Float32Array(n * 8);
      order = Array.from({ length: n }, (_, i) => i);
      for (let i = 0; i < n; i++) {
        const c = m.cells[i];
        wk[i] = c.week;
        dy[i] = c.day;
        lv[i] = c.level;
        hgt[i] = barHeight(c.count, m.max);
      }
    };

    const retheme = () => {
      const cs = getComputedStyle(stage);
      fg = toRgb(cs.color, FG_FALLBACK) ?? FG_FALLBACK;
      bg = toRgb(cs.backgroundColor, null) ?? (luminance(fg) > 0.5 ? [10, 10, 10] : BG_FALLBACK);
      const dark = luminance(bg) < 0.45;
      const token = (name: string): Rgb => toRgb(cs.getPropertyValue(name).trim(), FG_FALLBACK) ?? FG_FALLBACK;
      palette = (dark ? SKYLINE_PALETTE.dark : SKYLINE_PALETTE.light).map(token);
      empty = mix(bg, fg, dark ? 0.12 : 0.08);
      muted = mix(bg, fg, 0.55);
      font = `400 11px ${cs.fontFamily || "sans-serif"}`;
      ctx.font = font;
      labelW = Math.ceil(Math.max(20, ...["Mon", "Wed", "Fri"].map((s) => ctx.measureText(s).width))) + 8;
      relayout();
    };

    const extent = (cam: Cam, e: number, full: boolean) => {
      const w = lerp(0.78, 0.9, e);
      const off = (1 - w) / 2;
      let minx = Infinity;
      let maxx = -Infinity;
      let miny = Infinity;
      let maxy = -Infinity;
      const add = (x: number, y: number, z: number) => {
        const p = project(cam, x, y, z);
        minx = Math.min(minx, p[0]);
        maxx = Math.max(maxx, p[0]);
        miny = Math.min(miny, p[1]);
        maxy = Math.max(maxy, p[1]);
      };
      for (let i = 0; i < n; i++) {
        const x0 = wk[i] + off;
        const y0 = dy[i] + off;
        const z = full ? hgt[i] * e : zs[i];
        add(x0, y0, z);
        add(x0 + w, y0 + w, z);
        add(x0, y0 + w, 0);
        add(x0 + w, y0, 0);
      }
      add(0, 7 + 1.5 * e, 0);
      add(weeks, 7 + 1.5 * e, 0);
      return { minx, maxx, miny, maxy };
    };

    const relayout = () => {
      const w = Math.round(stage.clientWidth);
      if (!w || !n) return;
      W = w;
      gutter = W < 520 ? 0 : labelW;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const b2 = extent(camera(0), 0, true);
      H2 = 24 + ((b2.maxy - b2.miny) / (b2.maxx - b2.minx)) * (W - gutter - 4);
      const b3 = extent(camera(1), 1, true);
      const natural = ((b3.maxy - b3.miny) / (b3.maxx - b3.minx)) * (W - 40) + 40;
      H3 = Math.max(Math.min(natural, W * 0.72, 560), Math.min(natural, 240));
      Hmax = Math.ceil(Math.max(H2, H3));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(Hmax * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${Hmax}px`;
      draw();
    };

    const draw = () => {
      if (!W || !n) return;
      const e = easeInOutCubic(t);
      const cam = camera(e);
      const Hc = lerp(H2, H3, e);
      stage.style.height = `${Hc.toFixed(1)}px`;
      for (let i = 0; i < n; i++) zs[i] = riseAt(t, wk[i], weeks, dy[i]) * hgt[i];
      const b = extent(cam, e, false);
      const pad = lerp(2, 20, e);
      const left = pad + gutter * (1 - e);
      const top = pad + 20 * (1 - e);
      const aw = W - left - pad;
      const ah = Hc - top - pad;
      const s = Math.min(aw / Math.max(1e-6, b.maxx - b.minx), ah / Math.max(1e-6, b.maxy - b.miny));
      const ox = left + (aw - (b.maxx - b.minx) * s) / 2 - b.minx * s;
      const oy = top + (ah - (b.maxy - b.miny) * s) / 2 - b.miny * s;
      const { cs, sn, se, ce } = cam;
      const px = (x: number, y: number) => ox + (x * cs - y * sn) * s;
      const py = (x: number, y: number, z: number) => oy + ((x * sn + y * cs) * se - z * ce) * s;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, Hmax);
      order.sort((a, c) => depthOf(cam, wk[a] + 0.5, dy[a] + 0.5) - depthOf(cam, wk[c] + 0.5, dy[c] + 0.5));

      const w = lerp(0.78, 0.9, e);
      const off = (1 - w) / 2;
      const radius = lerp(0.17, 0.03, e) * s;
      for (const i of order) {
        const x0 = wk[i] + off;
        const y0 = dy[i] + off;
        const x1 = x0 + w;
        const y1 = y0 + w;
        const z = zs[i] + hov[i] * 0.5 * e;
        const top = [
          px(x0, y0),
          py(x0, y0, z),
          px(x1, y0),
          py(x1, y0, z),
          px(x1, y1),
          py(x1, y1, z),
          px(x0, y1),
          py(x0, y1, z),
        ];
        quads.set(top, i * 8);
        const level = lv[i];
        const base = level === 0 ? empty : palette[level - 1];
        const fill = hov[i] > 0.01 ? mix(base, fg, 0.18 * hov[i]) : base;
        if (e > 0.02) {
          const tall = z * ce * s;
          if (tall > 0.35) {
            // +y face (left on screen) and +x face (right on screen), darker
            const left = [px(x0, y1), py(x0, y1, 0), px(x1, y1), py(x1, y1, 0), top[4], top[5], top[6], top[7]];
            const right = [px(x1, y0), py(x1, y0, 0), px(x1, y1), py(x1, y1, 0), top[4], top[5], top[2], top[3]];
            if (w * cs * s > 0.35) {
              quad(ctx, left);
              ctx.fillStyle = rgb(fill, 0.84);
              ctx.fill();
            }
            if (w * sn * s > 0.35) {
              quad(ctx, right);
              ctx.fillStyle = rgb(fill, 0.68);
              ctx.fill();
            }
          }
        }
        // Rounded top face in 2D, a sharp box in 3D.
        ctx.beginPath();
        if (radius < 0.3) quad(ctx, top);
        else {
          ctx.moveTo((top[6] + top[0]) / 2, (top[7] + top[1]) / 2);
          for (let k = 0; k < 8; k += 2) ctx.arcTo(top[k], top[k + 1], top[(k + 2) % 8], top[(k + 3) % 8], radius);
          ctx.closePath();
        }
        ctx.fillStyle = rgb(fill);
        ctx.fill();
        if (i === activeRef.current) {
          ctx.strokeStyle = rgb(fg);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Month labels: along the top in 2D, along the front edge in 3D. They fade rather than pop.
      ctx.font = font;
      ctx.fillStyle = rgb(muted);
      const a2 = 1 - smoothstep(0, 0.4, e);
      const a3 = smoothstep(0.62, 1, e);
      ctx.globalAlpha = a2;
      if (a2 > 0.01) {
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        let edge = -Infinity;
        for (const m of live.current.model.months) {
          const x = px(m.week, -0.3);
          const tw = ctx.measureText(m.label).width;
          if (x < edge || x + tw > W) continue;
          ctx.fillText(m.label, x, py(m.week, -0.3, 0) - 3);
          edge = x + tw + 6;
        }
      }
      ctx.globalAlpha = a3;
      if (a3 > 0.01) {
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        let edge = -Infinity;
        for (const m of live.current.model.months) {
          const x = px(m.week + 0.5, 7.3);
          const tw = ctx.measureText(m.label).width;
          if (x < edge || x + tw > W) continue;
          ctx.fillText(m.label, x, py(m.week + 0.5, 7.3, 0) + 2);
          edge = x + tw + 10;
        }
      }
      ctx.globalAlpha = 1;

      // The tooltip rides the active day through morphs.
      if (activeRef.current >= 0 && activeRef.current < n) {
        const i = activeRef.current;
        const z = zs[i] + hov[i] * 0.5 * e;
        const tx = px(wk[i] + 0.5, dy[i] + 0.5);
        const ty = Math.min(py(wk[i] + off, dy[i] + off, z), py(wk[i] + off + w, dy[i] + off, z));
        const half = tipW / 2;
        const cx = Math.min(W - half - 2, Math.max(half + 2, tx));
        tip.style.transform = `translate(${(cx - half).toFixed(1)}px, ${(ty - 8).toFixed(1)}px) translateY(-100%)`;
        tip.style.setProperty("--arrow", `${(tx - cx + half).toFixed(1)}px`);
      }
      if (tipW === 0 && tip.offsetWidth) tipW = tip.offsetWidth;
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      let moving = false;
      if (t !== goal.current) {
        const step = reduced ? 1 : (dt * 1000) / 1300;
        t = goal.current > t ? Math.min(goal.current, t + step) : Math.max(goal.current, t - step);
        moving = true;
      }
      const k = reduced ? 1 : 1 - Math.exp(-dt * 16);
      for (let i = 0; i < n; i++) {
        const target = i === activeRef.current ? 1 : 0;
        if (Math.abs(target - hov[i]) > 0.003) {
          hov[i] += (target - hov[i]) * k;
          moving = true;
        } else hov[i] = target;
      }
      draw();
      if (moving) raf = requestAnimationFrame(tick);
    };
    kickRef.current = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const setActiveIdx = (i: number) => {
      if (i === activeRef.current) return;
      activeRef.current = i;
      live.current.setActive(i);
      kickRef.current();
    };
    /** The day whose drawn top face contains the point (front-most first), so tall bars are hit where they are. */
    const hit = (x: number, y: number): number => {
      for (let k = order.length - 1; k >= 0; k--) {
        const i = order[k];
        const o = i * 8;
        let sign = 0;
        let inside = true;
        for (let j = 0; j < 4; j++) {
          const ax = quads[o + j * 2];
          const ay = quads[o + j * 2 + 1];
          const bx = quads[o + ((j + 1) % 4) * 2];
          const by = quads[o + ((j + 1) % 4) * 2 + 1];
          const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
          if (Math.abs(cross) < 1e-9) continue;
          const sg = cross > 0 ? 1 : -1;
          if (sign === 0) sign = sg;
          else if (sg !== sign) {
            inside = false;
            break;
          }
        }
        if (inside && sign !== 0) return i;
      }
      return -1;
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse") return;
      const r = canvas.getBoundingClientRect();
      const i = hit(ev.clientX - r.left, ev.clientY - r.top);
      if (i !== hovered) {
        hovered = i;
        setActiveIdx(pinnedRef.current >= 0 && i < 0 ? pinnedRef.current : i);
      }
    };
    const onLeave = () => {
      hovered = -1;
      setActiveIdx(pinnedRef.current);
    };
    const onClick = (ev: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const i = hit(ev.clientX - r.left, ev.clientY - r.top);
      pinnedRef.current = i === pinnedRef.current ? -1 : i;
      setActiveIdx(pinnedRef.current >= 0 ? pinnedRef.current : hovered);
    };
    const onKey = (ev: KeyboardEvent) => {
      const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"];
      if (!keys.includes(ev.key) || !n) return;
      ev.preventDefault();
      if (ev.key === "Escape") {
        pinnedRef.current = -1;
        setActiveIdx(-1);
        return;
      }
      let i = pinnedRef.current >= 0 ? pinnedRef.current : activeRef.current >= 0 ? activeRef.current : n - 1;
      if (ev.key === "ArrowLeft") i -= 7;
      if (ev.key === "ArrowRight") i += 7;
      if (ev.key === "ArrowUp") i -= 1;
      if (ev.key === "ArrowDown") i += 1;
      if (ev.key === "Home") i = 0;
      if (ev.key === "End") i = n - 1;
      i = Math.max(0, Math.min(n - 1, i));
      pinnedRef.current = i;
      setActiveIdx(i);
      live.current.setAnnounce(live.current.describe(i));
    };

    load();
    retheme();
    const ro = new ResizeObserver(() => {
      if (Math.round(stage.clientWidth) !== W) relayout();
    });
    ro.observe(stage);
    const mo = new MutationObserver(retheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onClick);
    canvas.addEventListener("keydown", onKey);
    kickRef.current();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onClick);
      canvas.removeEventListener("keydown", onKey);
      kickRef.current = () => undefined;
    };
  }, [model]);

  const { stats } = model;
  const range = (a: string | null, b: string | null) =>
    a && b ? `${dfs.format(dayMs(a))} — ${dfs.format(dayMs(b))}` : "—";
  const heading = title ?? `${nf.format(stats.total)} ${noun(stats.total)} in the period`;
  const tipCount = active >= 0 ? model.cells[active] : undefined;

  return (
    <section className="skyline" aria-label={heading}>
      <header className="skyline-head">
        <h3 className="skyline-title">{heading}</h3>
        <div className="skyline-toggle" role="group" aria-label="Chart view">
          <Button aria-pressed={view === "2d"} onClick={() => setView("2d")}>
            Flat
          </Button>
          <Button aria-pressed={view === "3d"} onClick={() => setView("3d")}>
            Skyline
          </Button>
        </div>
      </header>
      <div className="skyline-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label={`${nf.format(stats.total)} ${noun(stats.total)} between ${range(stats.first, stats.last)}, as a ${view === "3d" ? "skyline" : "heat map"}. Use the arrow keys to read single days.`}
          className="skyline-canvas"
        />
        <div ref={tipRef} role="tooltip" className="skyline-tip" style={{ opacity: tipCount ? 1 : 0 }}>
          {tipCount ? (
            <>
              <strong>
                {tipCount.count ? `${nf.format(tipCount.count)} ${noun(tipCount.count)}` : `No ${plural}`}
              </strong>
              <span> on {dfs.format(dayMs(tipCount.date))}</span>
            </>
          ) : (
            " "
          )}
        </div>
      </div>
      <dl className="skyline-stats">
        <div>
          <dt>Total</dt>
          <dd>{nf.format(stats.total)}</dd>
        </div>
        <div>
          <dt>Busiest day</dt>
          <dd>{nf.format(stats.busiest.count)}</dd>
        </div>
        <div>
          <dt>Longest run</dt>
          <dd>{stats.longest.days} days</dd>
        </div>
        <div>
          <dt>Run up to the last day</dt>
          <dd>{stats.current.days} days</dd>
        </div>
      </dl>
      <footer className="skyline-foot">
        <span>
          {footer ?? "Hover a day for details · arrow keys to explore · the bars are hotspot detections, not fires"}
        </span>
        <span className="skyline-legend" aria-hidden="true">
          Less
          {SKYLINE_PALETTE.light.map((name) => (
            <i key={name} className="skyline-swatch" style={{ background: `var(${name})` }} />
          ))}
          More
        </span>
      </footer>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
