import { Dialog } from "@base-ui/react/dialog";
import { useRef, type ReactNode } from "react";

type InfoDialogProps = {
  triggerLabel: string;
  title: string;
  children: ReactNode;
};

export function InfoDialog({ triggerLabel, title, children }: InfoDialogProps) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  return (
    <Dialog.Root>
      <Dialog.Trigger className="button">{triggerLabel}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup" initialFocus={titleRef}>
          <Dialog.Title className="dialog-title" ref={titleRef} tabIndex={-1}>
            {title}
          </Dialog.Title>
          {/* Focus starts on the title so opening the dialog keeps its heading visible.
              The body remains a keyboard scroll target. */}
          <div className="dialog-body" tabIndex={0}>
            {children}
          </div>
          <div className="dialog-actions">
            <Dialog.Close className="button">Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
