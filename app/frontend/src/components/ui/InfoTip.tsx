import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

type InfoTipProps = {
  /** Accessible name of the button, e.g. "About the data series". */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * A small "i" that keeps a caveat one hover or tap away: opens on hover and on click, so it also works on touch
 * screens and with a keyboard. Use it for explanations, never for the only copy of a warning the reader must see.
 */
export function InfoTip({ label, children, className }: InfoTipProps) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger className={cx("info-tip", className)} aria-label={label} openOnHover delay={150}>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 7.25v4" />
          <circle cx="8" cy="4.9" r="0.6" className="info-tip-dot" />
        </svg>
      </BasePopover.Trigger>
      <BasePopover.Portal>
        <BasePopover.Positioner sideOffset={6} className="popup-positioner">
          <BasePopover.Popup className="tooltip info-tip-popup">{children}</BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
