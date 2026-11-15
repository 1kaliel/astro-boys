import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactNode } from "react";

type PopoverProps = {
  /** Content of the trigger button (rendered as a filter chip). */
  trigger: ReactNode;
  triggerLabel: string;
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export function Popover({ trigger, triggerLabel, title, open, onOpenChange, children }: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BasePopover.Trigger className="chip" aria-label={triggerLabel}>
        {trigger}
      </BasePopover.Trigger>
      <BasePopover.Portal>
        <BasePopover.Positioner sideOffset={6} align="start" className="popup-positioner">
          <BasePopover.Popup className="popover">
            {title && <BasePopover.Title className="popover-title">{title}</BasePopover.Title>}
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
