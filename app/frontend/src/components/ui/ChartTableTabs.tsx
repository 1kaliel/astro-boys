import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

type ChartTableTabsProps = {
  label: string;
  chart: ReactNode;
  table: ReactNode;
  /** Controls shown before the Chart / Table switch, in the same toolbar row (e.g. year and month pickers). */
  lead?: ReactNode;
  /** Controls at the end of the toolbar row (e.g. the Export menu). */
  actions?: ReactNode;
};

/** Every chart has a table view (accessibility and exact values). */
export function ChartTableTabs({ label, chart, table, lead, actions }: ChartTableTabsProps) {
  return (
    <Tabs.Root defaultValue="chart" className="tabs">
      <div className="tabs-bar">
        {lead}
        <Tabs.List className="tabs-list" aria-label={`${label}: view`}>
          <Tabs.Tab value="chart" className="tabs-tab">
            Chart
          </Tabs.Tab>
          <Tabs.Tab value="table" className="tabs-tab">
            Table
          </Tabs.Tab>
        </Tabs.List>
        {actions}
      </div>
      <Tabs.Panel value="chart" className="tabs-panel">
        {chart}
      </Tabs.Panel>
      <Tabs.Panel value="table" className="tabs-panel">
        {table}
      </Tabs.Panel>
    </Tabs.Root>
  );
}
