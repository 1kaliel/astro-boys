import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import "../../styles/header-help.css";

/**
 * Spotlight tour, no dependency. Each step points at an element by CSS selector (`[data-tour="filters"]`): the page
 * is dimmed, the element is cut out and outlined, and a small dialog next to it explains it. Steps whose element is
 * missing or hidden are skipped, so the tour never stops on an empty spot.
 */
export type TourStep = {
  /** CSS selector of the element to show, e.g. `[data-tour="filters"]`. The first visible match is used. */
  target: string;
  title: string;
  body: string;
};

export type TourCloseReason = "done" | "skip";

type TourProps = {
  steps: readonly TourStep[];
  open: boolean;
  onClose: (reason: TourCloseReason) => void;
  /** Where the focus goes when the tour closes (the Guide button). Falls back to the element focused at open. */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export type Rect = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Placement =
  | { kind: "side"; side: "bottom" | "top" | "right" | "left"; top: number; left: number }
  | { kind: "dock" };

export const TOUR_STORAGE_KEY = "firewatcher-tour-seen";
/** Space between the target and the popover, and between the popover and the window edge (px). */
const GAP = 12;
const EDGE = 8;
/** Room the sticky app bar takes at the top of the window when a target is scrolled into view (px). */
const TOP_OFFSET = 72;

/** True once the viewer has finished, skipped or dismissed the guide. Storage can be blocked: then false. */
export function readTourSeen(storage: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(TOUR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(TOUR_STORAGE_KEY, "1");
  } catch {
    // Storage blocked: the prompt shows again on the next visit, nothing else changes.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The next step, from `from` in direction `dir` (+1 or -1), whose target is on the page; -1 when there is none.
 * `from` itself is checked first.
 */
export function findAvailableStep(
  steps: readonly TourStep[],
  from: number,
  dir: 1 | -1,
  exists: (selector: string) => boolean,
): number {
  for (let i = from; i >= 0 && i < steps.length; i += dir) {
    if (exists(steps[i].target)) return i;
  }
  return -1;
}

/**
 * Where the popover goes: below the target, else above, else right, else left, inside the window. On a phone, or when
 * it fits on no side (a target as tall as the window), it docks to the bottom of the window.
 */
export function placePopover(target: Rect, popover: Size, viewport: Size, dock: boolean): Placement {
  if (dock) return { kind: "dock" };
  const clampLeft = (left: number) => Math.min(Math.max(left, EDGE), viewport.width - popover.width - EDGE);
  const clampTop = (top: number) => Math.min(Math.max(top, EDGE), viewport.height - popover.height - EDGE);
  const centerX = target.left + target.width / 2 - popover.width / 2;
  const centerY = target.top + target.height / 2 - popover.height / 2;
  const below = target.top + target.height + GAP;
  if (below + popover.height + EDGE <= viewport.height) {
    return { kind: "side", side: "bottom", top: below, left: clampLeft(centerX) };
  }
  const above = target.top - GAP - popover.height;
  if (above >= EDGE) return { kind: "side", side: "top", top: above, left: clampLeft(centerX) };
  const right = target.left + target.width + GAP;
  if (right + popover.width + EDGE <= viewport.width) {
    return { kind: "side", side: "right", top: clampTop(centerY), left: right };
  }
  const left = target.left - GAP - popover.width;
  if (left >= EDGE) return { kind: "side", side: "left", top: clampTop(centerY), left };
  return { kind: "dock" };
}

/** The part of the target inside the window, so a tall map or calendar is outlined where it can be seen. */
export function clipToViewport(rect: Rect, viewport: Size, pad = 6): Rect {
  const top = Math.max(rect.top - pad, EDGE / 2);
  const left = Math.max(rect.left - pad, EDGE / 2);
  const bottom = Math.min(rect.top + rect.height + pad, viewport.height - EDGE / 2);
  const right = Math.min(rect.left + rect.width + pad, viewport.width - EDGE / 2);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** First match that is rendered (the help controls exist twice: in the bar and in the phone menu). */
function findTarget(selector: string): HTMLElement | null {
  let nodes: NodeListOf<HTMLElement>;
  try {
    nodes = document.querySelectorAll<HTMLElement>(selector);
  } catch {
    return null; // an invalid selector is a missing target
  }
  for (const node of nodes) {
    const box = node.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) return node;
  }
  return null;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isPhone(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 40rem)").matches;
}

function viewportSize(): Size {
  return { width: document.documentElement.clientWidth, height: window.innerHeight };
}

function toRect(box: DOMRect): Rect {
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

/** Puts the target in view under the sticky app bar: centered on a large screen, near the top on a phone. */
function scrollTargetIntoView(node: HTMLElement, dock: boolean) {
  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  node.scrollIntoView({ block: "nearest", inline: "nearest" }); // nested scroll areas first
  const box = node.getBoundingClientRect();
  const view = window.innerHeight;
  const room = dock ? view * 0.5 : view;
  const offset = box.height + TOP_OFFSET >= room ? TOP_OFFSET : dock ? TOP_OFFSET : Math.max(TOP_OFFSET, (view - box.height) / 2);
  const delta = box.top - offset;
  if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior });
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Tour({ steps, open, onClose, returnFocusRef }: TourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement>({ kind: "dock" });
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  const exists = useCallback((selector: string) => findTarget(selector) !== null, []);
  const available = open ? steps.filter((step) => exists(step.target)) : [];
  const position = available.indexOf(steps[index]);

  // Callers often pass inline callbacks: keep them in refs so a re-render never restarts the tour.
  const onCloseRef = useRef(onClose);
  const returnRef = useRef(returnFocusRef);
  const stepsRef = useRef(steps);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    returnRef.current = returnFocusRef;
    stepsRef.current = steps;
  });
  const close = useCallback((reason: TourCloseReason) => onCloseRef.current(reason), []);

  // Opening: remember who had the focus, start at the first step that has a target (or close at once).
  useLayoutEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = findAvailableStep(stepsRef.current, 0, 1, exists);
    if (first < 0) {
      close("done");
      return;
    }
    setIndex(first);
    setRect(null);
    // Return the focus when the tour closes or unmounts.
    return () => {
      const back = returnRef.current?.current ?? openerRef.current;
      if (back && back.isConnected) back.focus();
    };
  }, [open, exists, close]);

  const measure = useCallback(() => {
    const node = targetRef.current;
    const pop = popoverRef.current;
    if (!node || !node.isConnected) return;
    const viewport = viewportSize();
    const box = clipToViewport(toRect(node.getBoundingClientRect()), viewport);
    setRect(box);
    const size = pop ? { width: pop.offsetWidth, height: pop.offsetHeight } : { width: 320, height: 200 };
    setPlacement(placePopover(box, size, viewport, isPhone()));
  }, []);

  // Each step: find its target (skipping forward if it disappeared), scroll it into view, measure, focus the title.
  useEffect(() => {
    if (!open) return;
    const node = findTarget(steps[index]?.target ?? "");
    if (!node) {
      const next = findAvailableStep(steps, index, 1, exists);
      if (next < 0) close("done");
      else if (next !== index) setIndex(next);
      return;
    }
    targetRef.current = node;
    scrollTargetIntoView(node, isPhone());
    measure();
    titleRef.current?.focus({ preventScroll: true });
    // Smooth scrolling moves the target after the first measure: measure again when it settles.
    const settle = window.setTimeout(measure, prefersReducedMotion() ? 0 : 400);
    return () => window.clearTimeout(settle);
  }, [open, index, steps, exists, close, measure]);

  // Keep the cut-out on the target while the page scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
    };
  }, [open, measure]);

  const go = useCallback(
    (dir: 1 | -1) => {
      const next = findAvailableStep(steps, index + dir, dir, exists);
      if (next >= 0) setIndex(next);
      else if (dir === 1) close("done");
    },
    [steps, index, exists, close],
  );

  // Keyboard: Escape skips, arrows move, Tab stays inside the popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close("skip");
      } else if (event.key === "ArrowRight" && !event.altKey) {
        go(1);
      } else if (event.key === "ArrowLeft" && !event.altKey) {
        go(-1);
      } else if (event.key === "Tab" && popoverRef.current) {
        const items = Array.from(popoverRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        const inside = popoverRef.current.contains(active);
        if (event.shiftKey && (active === first || !inside)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !inside)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, go]);

  if (!open || typeof document === "undefined") return null;
  const step = steps[index];
  if (!step) return null;
  const isLast = findAvailableStep(steps, index + 1, 1, exists) < 0;
  const isFirst = findAvailableStep(steps, index - 1, -1, exists) < 0;
  const total = available.length;

  const popoverStyle =
    placement.kind === "side" ? { top: `${placement.top}px`, left: `${placement.left}px` } : undefined;

  return createPortal(
    <div className="tour-root">
      {/* Catches clicks: the page under the tour is shown, not used. */}
      <div className="tour-blocker" aria-hidden="true" />
      {rect && (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          style={{ top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` }}
        />
      )}
      <div
        ref={popoverRef}
        className="tour-popover"
        data-placement={placement.kind === "side" ? placement.side : "dock"}
        style={popoverStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <div className="tour-head">
          <p className="tour-count">
            Step {Math.max(position, 0) + 1} of {total}
          </p>
          <button type="button" className="tour-skip" onClick={() => close("skip")}>
            Skip tour
          </button>
        </div>
        <h2 id={titleId} ref={titleRef} className="tour-title" tabIndex={-1}>
          {step.title}
        </h2>
        <p id={bodyId} className="tour-body">
          {step.body}
        </p>
        <div className="tour-progress" aria-hidden="true">
          {available.map((item, i) => (
            <span key={item.target} className="tour-dot" data-active={i === position || undefined} />
          ))}
        </div>
        <div className="tour-actions">
          {!isFirst && (
            <button type="button" className="button" onClick={() => go(-1)}>
              Back
            </button>
          )}
          <button type="button" className="button tour-next" onClick={() => (isLast ? close("done") : go(1))}>
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
