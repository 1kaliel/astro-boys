import { TooltipProvider } from "./components/ui/Tooltip";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { LandingPage } from "./features/landing/LandingPage";
import { useHashRoute } from "./lib/hashRoute";
import { DashboardProvider } from "./state/dashboard";

export { goHome } from "./lib/hashRoute";

/**
 * Two screens behind hash routes: "" / #home is the landing page (the story), #explore (or any other hash) is the
 * explorer (the tool). The dashboard state lives above both, so going back and forth keeps the filters.
 */
export function App() {
  const route = useHashRoute();
  return (
    <DashboardProvider>
      <TooltipProvider>{route === "home" ? <LandingPage /> : <DashboardPage />}</TooltipProvider>
    </DashboardProvider>
  );
}
