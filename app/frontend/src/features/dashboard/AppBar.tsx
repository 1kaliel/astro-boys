import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Badge } from "../../components/ui/Badge";
import { Tooltip } from "../../components/ui/Tooltip";
import { markTourSeen, readTourSeen, Tour, type TourStep } from "../../components/ui/Tour";
import type { ApiStatus } from "../../data/useApiStatus";
import { useColorScheme } from "../../lib/hooks";
import { applyTheme } from "../../lib/theme";
import "../../styles/header-help.css";
import { DataGuideDialog } from "./DataGuideDialog";
import { TOUR_STEPS } from "./tourSteps";

const API_TEXT = {
  checking: "Checking the data service…",
  ok: "Data service connected",
  unavailable: "Data service unavailable, retrying…",
} as const;

export type AppBarProps = {
  apiStatus: ApiStatus;
  simulated: boolean;
  modelVersion: string | null;
  /** Steps of the Guide tour; the dashboard's own steps by default. */
  tourSteps?: readonly TourStep[];
};

/* Small line icons, drawn in the text color. */
function Icon({ name }: { name: "guide" | "data" | "sun" | "moon" | "menu" | "close" }) {
  const paths: Record<typeof name, string> = {
    guide: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z",
    data: "M5 4h9l5 5v11H5V4Zm9 0v5h5M8 13h8M8 17h5",
    sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
    moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z",
    menu: "M4 7h16M4 12h16M4 17h16",
    close: "M6 6l12 12M18 6 6 18",
  };
  return (
    <svg className="hh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}

/** Visible element among the refs (the bar's buttons are hidden on phones, the menu button on large screens). */
function firstVisible(...refs: RefObject<HTMLElement | null>[]): HTMLElement | null {
  for (const ref of refs) {
    const node = ref.current;
    if (node && node.getClientRects().length > 0) return node;
  }
  return null;
}

export function AppBar({ apiStatus, simulated, modelVersion, tourSteps = TOUR_STEPS }: AppBarProps) {
  const scheme = useColorScheme();
  const next = scheme === "dark" ? "light" : "dark";
  const themeLabel = `Switch to ${next} theme`;

  const [tourOpen, setTourOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [seen, setSeen] = useState(() => readTourSeen());

  const guideButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  /** Where the focus returns when the tour or the data guide closes. */
  const tourBackRef = useRef<HTMLElement | null>(null);
  const dataBackRef = useRef<HTMLElement | null>(null);
  const menuId = useId();

  const opener = () => firstVisible(guideButtonRef, menuButtonRef);

  const startTour = () => {
    tourBackRef.current = opener();
    setMenuOpen(false);
    setTourOpen(true);
  };

  const openData = (from: HTMLElement | null) => {
    dataBackRef.current = from;
    setMenuOpen(false);
    setDataOpen(true);
  };

  const finishTour = () => {
    setTourOpen(false);
    markTourSeen();
    setSeen(true);
  };

  const dismissPrompt = () => {
    markTourSeen();
    setSeen(true);
  };

  // Phone menu: Escape or a click elsewhere closes it; the first item takes the focus when it opens.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  const statusText = simulated
    ? `${API_TEXT[apiStatus]} · Simulated data`
    : `${API_TEXT[apiStatus]}${modelVersion ? ` · Model ${modelVersion}` : ""}`;
  const showPrompt = !seen && !tourOpen;

  return (
    <header className="app-bar hh-bar">
      <div className="app-brand">
        <span className="app-logo" aria-hidden="true" />
        <div className="hh-brand-text">
          <div className="hh-title-row">
            <h1 className="app-title">FIREWATCHER</h1>
            <Tooltip content={statusText} side="bottom">
              <button type="button" className="hh-status" data-status={apiStatus} aria-label={statusText}>
                <span className="hh-status-dot" aria-hidden="true" />
              </button>
            </Tooltip>
            {simulated && <Badge kind="simulated" />}
          </div>
          {/* The name alone could read as live fire alerts: the subtitle always says what the app is. */}
          <p className="app-subtitle hh-subtitle">
            <span className="hh-subtitle-full">Hotspot calendar for Northeast Brazil, 2002 to present · not live alerts</span>
            <span className="hh-subtitle-short">Hotspot calendar · not live alerts</span>
          </p>
        </div>
      </div>

      {/* Polite announcement of the data service status; the dot shows it visually. */}
      <span className="sr-only" role="status" aria-live="polite">
        {API_TEXT[apiStatus]}
      </span>

      <nav className="hh-controls" aria-label="Help and display" data-tour="help">
        <button type="button" ref={guideButtonRef} className="button hh-button" onClick={startTour}>
          <Icon name="guide" />
          Guide
        </button>
        <button
          type="button"
          className="button hh-button"
          onClick={(event) => openData(event.currentTarget)}
          aria-haspopup="dialog"
        >
          <Icon name="data" />
          Understand the data
        </button>
        <button
          type="button"
          className="button icon-button hh-button hh-theme"
          onClick={() => applyTheme(next)}
          aria-label={themeLabel}
          title={themeLabel}
        >
          <Icon name={scheme === "dark" ? "sun" : "moon"} />
        </button>
      </nav>

      <div className="hh-mobile" data-tour="help">
        <button
          type="button"
          ref={menuButtonRef}
          className="button icon-button hh-button hh-menu-button"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name={menuOpen ? "close" : "menu"} />
        </button>
        <div ref={menuRef} id={menuId} className="hh-menu" hidden={!menuOpen}>
          <button type="button" className="hh-menu-item" onClick={startTour}>
            <Icon name="guide" />
            <span>
              Guide
              <small>How to move around, filter and pick dates</small>
            </span>
          </button>
          <button type="button" className="hh-menu-item" onClick={() => openData(menuButtonRef.current)}>
            <Icon name="data" />
            <span>
              Understand the data
              <small>What the numbers mean and their limits</small>
            </span>
          </button>
          <button
            type="button"
            className="hh-menu-item"
            onClick={() => {
              applyTheme(next);
              setMenuOpen(false);
              menuButtonRef.current?.focus();
            }}
          >
            <Icon name={scheme === "dark" ? "sun" : "moon"} />
            <span>{next === "dark" ? "Dark theme" : "Light theme"}</span>
          </button>
          <p className="hh-menu-status">
            <span className="hh-status-dot" data-status={apiStatus} aria-hidden="true" />
            {statusText}
          </p>
        </div>
      </div>

      {showPrompt && (
        <aside className="hh-prompt" aria-label="Guide">
          <p className="hh-prompt-text">
            <strong>New here?</strong> Take the 1-minute guide.
          </p>
          <div className="hh-prompt-actions">
            <button type="button" className="button tour-next" onClick={startTour}>
              Start guide
            </button>
            <button type="button" className="button icon-button" onClick={dismissPrompt} aria-label="Dismiss">
              <Icon name="close" />
            </button>
          </div>
        </aside>
      )}

      <Tour steps={tourSteps} open={tourOpen} onClose={finishTour} returnFocusRef={tourBackRef} />
      <DataGuideDialog
        open={dataOpen}
        onOpenChange={setDataOpen}
        modelVersion={modelVersion}
        simulated={simulated}
        finalFocus={dataBackRef}
      />
    </header>
  );
}
