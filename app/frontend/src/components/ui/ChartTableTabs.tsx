import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

type ChartTableTabsProps = {
  label: string;
  chart: ReactNode;
  table: ReactNode;
  /** An optional third view of the same data (the daily Skyline of the calendar). */
  extra?: { name: string; panel: ReactNode };
};

/** Every chart has a table view (accessibility and exact values). */
export function ChartTableTabs({ label, chart, table, extra }: ChartTableTabsProps) {
  return (
    <Tabs.Root defaultValue="chart" className="tabs">
      <Tabs.List className="tabs-list" aria-label={`${label}: view`}>
        <Tabs.Tab value="chart" className="tabs-tab">
          Chart
        </Tabs.Tab>
        <Tabs.Tab value="table" className="tabs-tab">
          Table
        </Tabs.Tab>
        {extra && (
          <Tabs.Tab value="extra" className="tabs-tab">
            {extra.name}
          </Tabs.Tab>
        )}
      </Tabs.List>
      <Tabs.Panel value="chart" className="tabs-panel">
        {chart}
      </Tabs.Panel>
      <Tabs.Panel value="table" className="tabs-panel">
        {table}
      </Tabs.Panel>
      {extra && (
        <Tabs.Panel value="extra" className="tabs-panel">
          {extra.panel}
        </Tabs.Panel>
      )}
    </Tabs.Root>
  );
}
