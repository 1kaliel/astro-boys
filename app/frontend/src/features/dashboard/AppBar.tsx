import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { ApiStatus } from "../../data/useApiStatus";
import { useColorScheme } from "../../lib/hooks";
import { applyTheme } from "../../lib/theme";
import logoDark from "../../assets/brand/firewatcher-logo-horizontal-compacto-negativo.svg";
import logoLight from "../../assets/brand/firewatcher-logo-horizontal-compacto.svg";
import { AboutDialog } from "./AboutDialog";

const API_TEXT = {
  checking: "Checking API…",
  ok: "API connected",
  unavailable: "API unavailable, retrying…",
} as const;

type AppBarProps = {
  apiStatus: ApiStatus;
  simulated: boolean;
  modelVersion: string | null;
};

export function AppBar({ apiStatus, simulated, modelVersion }: AppBarProps) {
  const scheme = useColorScheme();
  const next = scheme === "dark" ? "light" : "dark";

  return (
    <header className="app-bar">
      <div className="app-brand">
        {/* Two signatures, one per theme: the "negative" one is drawn for dark backgrounds. CSS shows the right one,
            so it follows the theme toggle as well as the OS setting. */}
        <span className="brand-logo">
          <img className="brand-logo-light" src={logoLight} alt="Firewatcher" />
          <img className="brand-logo-dark" src={logoDark} alt="Firewatcher" />
        </span>
        <div>
          <h1 className="app-title">Hotspot calendar</h1>
          <p className="app-subtitle">Northeast Brazil · harmonized MODIS and VIIRS active-fire hotspots, 2002 to present</p>
        </div>
      </div>
      <div className="app-actions">
        <span className="api-status" role="status" aria-live="polite">
          {API_TEXT[apiStatus]}
        </span>
        {simulated ? <Badge kind="simulated" /> : modelVersion && <span className="badge">Model {modelVersion}</span>}
        <AboutDialog />
        <Button
          className="icon-button"
          onClick={() => applyTheme(next)}
          aria-label={`Switch to ${next} theme`}
          title={`Switch to ${next} theme`}
        >
          <span aria-hidden="true">{scheme === "dark" ? "☀" : "☾"}</span>
        </Button>
      </div>
    </header>
  );
}
