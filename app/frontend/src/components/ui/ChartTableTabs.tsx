import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

type ChartTableTabsProps = {
  label: string;
  chart: ReactNode;
  table: ReactNode;
};

/** Every chart has a table view (accessibility and exact values). */
export function ChartTableTabs({ label, chart, table }: ChartTableTabsProps) {
  return (
    <Tabs.Root defaultValue="chart" className="tabs">
      <Tabs.List className="tabs-list" aria-label={`${label}: view`}>
        <Tabs.Tab value="chart" className="tabs-tab">
          Chart
        </Tabs.Tab>
        <Tabs.Tab value="table" className="tabs-tab">
          Table
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="chart" className="tabs-panel">
        {chart}
      </Tabs.Panel>
      <Tabs.Panel value="table" className="tabs-panel">
        {table}
      </Tabs.Panel>
    </Tabs.Root>
  );
}
