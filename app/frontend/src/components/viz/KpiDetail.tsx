import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { Badge } from "../ui/Badge";
import { formatCount } from "../../lib/format";
import { evidenceCsv, type Evidence } from "../../lib/kpiEvidence";

export type KpiContext = {
  areaText: string;
  periodText: string;
  /** The API answer the cards were computed from. Null when the data is the built-in sample. */
  apiUrl: string | null;
  modelVersion: string;
  synthetic: boolean;
};

const FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/";

function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** The panel behind a card: the exact figure, the rule, the records it comes from, and where to check them. */
export function KpiDetail({
  category,
  title,
  evidence,
  context,
  children,
}: {
  category: string;
  title: string;
  evidence: Evidence | null;
  context: KpiContext;
  /** The tile itself (the open control is inside it). */
  children: ReactNode;
}) {
  return (
    <Dialog.Root>
      {children}
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup kpi-detail">
          <Dialog.Title className="dialog-title">
            {category}: {title}
          </Dialog.Title>
          <div className="dialog-body" tabIndex={0}>
            {context.synthetic && (
              <p>
                <Badge kind="simulated" /> These records are synthetic, for building the screen. They are not results.
              </p>
            )}
            {evidence ? (
              <>
                <dl className="kpi-detail-facts">
                  <div>
                    <dt>Exact value</dt>
                    <dd>{evidence.exact}</dd>
                  </div>
                  <div>
                    <dt>Unit</dt>
                    <dd>{evidence.unit}</dd>
                  </div>
                  <div>
                    <dt>Area</dt>
                    <dd>{context.areaText}</dd>
                  </div>
                  <div>
                    <dt>Time of day</dt>
                    <dd>{context.periodText}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      NASA FIRMS active-fire detections (MODIS and VIIRS), harmonized to VIIRS-equivalent counts. Model{" "}
                      {context.modelVersion}.
                    </dd>
                  </div>
                </dl>
                <h3 className="kpi-detail-h">How it is calculated</h3>
                <p>{evidence.rule}</p>
                <h3 className="kpi-detail-h">Records ({evidence.rows.length})</h3>
                <div className="kpi-detail-scroll" tabIndex={0} role="region" aria-label="Records behind this figure">
                  <table className="calendar-table">
                    <thead>
                      <tr>
                        <th scope="col">Month</th>
                        <th scope="col">Detections</th>
                        <th scope="col">Median</th>
                        <th scope="col">Origin and notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidence.rows.map((row) => (
                        <tr key={row.label}>
                          <th scope="row">{row.label}</th>
                          <td>{row.value === null ? "No estimate" : formatCount(row.value)}</td>
                          <td>{row.reference === null ? "n/a" : formatCount(row.reference)}</td>
                          <td>{row.note || "n/a"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {evidence.excluded.length > 0 && (
                  <>
                    <h3 className="kpi-detail-h">Left out</h3>
                    <ul>
                      {evidence.excluded.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p>No records are available for this card in the current selection.</p>
            )}
            <p className="kpi-detail-links">
              <a href={FIRMS_URL} target="_blank" rel="noreferrer">
                NASA FIRMS
              </a>
              {context.apiUrl ? (
                <a href={context.apiUrl} target="_blank" rel="noreferrer">
                  API answer for this selection (JSON)
                </a>
              ) : (
                <span>API answer: not available (sample data)</span>
              )}
              {evidence && (
                <button
                  type="button"
                  className="kpi-detail-csv"
                  onClick={() =>
                    downloadCsv(`${category.toLowerCase().replace(/\W+/g, "-")}.csv`, evidenceCsv(evidence))
                  }
                >
                  Download these records (CSV)
                </button>
              )}
            </p>
          </div>
          <div className="dialog-actions">
            <Dialog.Close className="button">Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
