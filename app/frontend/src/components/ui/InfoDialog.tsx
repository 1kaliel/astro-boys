import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

type InfoDialogProps = {
  triggerLabel: string;
  title: string;
  children: ReactNode;
};

export function InfoDialog({ triggerLabel, title, children }: InfoDialogProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="button">{triggerLabel}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup">
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <div className="dialog-body">{children}</div>
          <div className="dialog-actions">
            <Dialog.Close className="button">Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
