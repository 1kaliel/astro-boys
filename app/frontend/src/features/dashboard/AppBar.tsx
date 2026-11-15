import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { ApiStatus } from "../../data/useApiStatus";
import { useColorScheme } from "../../lib/hooks";
import { applyTheme } from "../../lib/theme";
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
  const logo = scheme === "dark"
    ? "/brand/firewatcher-logo-horizontal-compacto-negativo.svg"
    : "/brand/firewatcher-logo-horizontal-compacto.svg";

  return (
    <header className="app-bar">
      <div className="app-brand">
        <div>
          <h1 className="app-title"><img src={logo} alt="FIREWATCHER" /></h1>
          {/* The name alone could read as live fire alerts: the subtitle always says what the app is. */}
          <p className="app-subtitle">
            <span className="app-subtitle-full">
              Hotspot calendar for Northeast Brazil, 2002 to present · harmonized MODIS and VIIRS hotspots
            </span>
            <span className="app-subtitle-short">Hotspot calendar, Northeast Brazil, 2002 to present</span>
          </p>
        </div>
      </div>
      <div className="app-actions">
        <span className="api-status" role="status" aria-live="polite">
          {API_TEXT[apiStatus]}
        </span>
        {/* Hidden on phones; the calendar card states the model too ("Data 2002–2026, model …"). */}
        {simulated ? <Badge kind="simulated" /> : modelVersion && (
          <span className="badge app-model" title={`Model ${modelVersion}`}>
            Model {modelVersion}
          </span>
        )}
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
