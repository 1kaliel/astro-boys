import { Dialog } from "@base-ui/react/dialog";
import { useRef, type ReactNode } from "react";
import type { Evidence } from "../../features/dashboard/kpiEvidence";

type EvidenceDialogProps = {
  title: string;
  evidence: Evidence;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Detail lines the card leaves out to stay short (baseline years, estimated months, the month so far). */
  notes?: ReactNode;
};

/** The proof behind a KPI: the figure, how it is made, the records it is made of and where they come from. */
export function EvidenceDialog({ title, evidence, open, onOpenChange, notes }: EvidenceDialogProps) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const { source } = evidence;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup" initialFocus={titleRef}>
          <Dialog.Title className="dialog-title" ref={titleRef} tabIndex={-1}>
            {title}
          </Dialog.Title>
          <div className="dialog-body" tabIndex={0}>
            <p className="evidence-value">{evidence.value}</p>
            {notes && <div className="evidence-notes">{notes}</div>}
            <h3>How it is computed</h3>
            <p>{evidence.how}</p>
            <h3>Records behind the figure</h3>
            <div className="evidence-table-wrap">
              <table className="evidence-table">
                <thead>
                  <tr>
                    {evidence.columns.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evidence.rows.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) =>
                        index === 0 ? (
                          <th key={index} scope="row">
                            {cell}
                          </th>
                        ) : (
                          <td key={index}>{cell}</td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Source</h3>
            <dl className="evidence-source">
              <dt>Provider</dt>
              <dd>{source.provider}</dd>
              <dt>Satellite and instrument</dt>
              <dd>{source.instruments}</dd>
              <dt>Area</dt>
              <dd>{source.area}</dd>
              <dt>Period</dt>
              <dd>{source.period}</dd>
              <dt>Model version</dt>
              <dd>{source.modelVersion}</dd>
              <dt>Data call</dt>
              <dd>
                <a href={source.apiUrl} target="_blank" rel="noreferrer">
                  {source.apiUrl}
                </a>
              </dd>
              {source.csvUrl && (
                <>
                  <dt>Native records</dt>
                  <dd>
                    <a href={source.csvUrl} download>
                      {source.csvLabel}
                    </a>{" "}
                    (not harmonized)
                  </dd>
                </>
              )}
            </dl>
            <p>Hotspots are satellite thermal detections: not confirmed fires and not burned area.</p>
          </div>
          <div className="dialog-actions">
            <Dialog.Close className="button">Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
