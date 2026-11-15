import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** One "Export" button for a card: the image and table downloads live in its menu instead of under the chart. */
export function ExportMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger className="button export-trigger" aria-label={label}>
        <Icon name="download" />
        Export
      </BasePopover.Trigger>
      <BasePopover.Portal>
        <BasePopover.Positioner sideOffset={6} align="end" className="popup-positioner">
          <BasePopover.Popup className="popover export-menu">
            <BasePopover.Title className="sr-only">{label}</BasePopover.Title>
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
