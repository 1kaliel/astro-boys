import { TooltipProvider } from "./components/ui/Tooltip";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { DashboardProvider } from "./state/dashboard";

export function App() {
  return (
    <DashboardProvider>
      <TooltipProvider>
        <DashboardPage />
      </TooltipProvider>
    </DashboardProvider>
  );
}
