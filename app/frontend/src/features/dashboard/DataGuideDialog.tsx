import { Dialog } from "@base-ui/react/dialog";
import { useRef, type ReactNode, type RefObject } from "react";
import { Fold } from "../../components/ui/Fold";
import "../../styles/header-help.css";

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

const SECTIONS = [
  { id: "dg-hotspot", label: "Hotspots" },
  { id: "dg-indicators", label: "Indicators" },
  { id: "dg-harmonized", label: "Harmonized vs native" },
  { id: "dg-reading", label: "Reading results" },
  { id: "dg-sources", label: "Sources" },
  { id: "dg-limits", label: "Limitations" },
] as const;

type DataGuideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelVersion: string | null;
  simulated: boolean;
  /** Where the focus returns when the dialog closes (the button that opened it). */
  finalFocus?: RefObject<HTMLElement | null>;
};

/**
 * "Understand the data": how to READ the dashboard (what the numbers mean, sources, criteria, limits). How to USE
 * it is the Guide tour; keep the two apart. Facts come from docs/methodology.md (Limitations), the data contract and
 * the FIRMS citation guidance in docs/resources.md; keep them in step when one changes.
 * Words: "hotspots" or "fire activity", never "fires" or "burned area"; a z-score is never a probability.
 */
export function DataGuideDialog({ open, onOpenChange, modelVersion, simulated, finalFocus }: DataGuideDialogProps) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const jump = (id: string) => {
    const section = bodyRef.current?.querySelector<HTMLElement>(`#${id}`);
    if (!section) return;
    section.scrollIntoView({ block: "start" });
    section.focus({ preventScroll: true });
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup data-guide" initialFocus={titleRef} finalFocus={finalFocus}>
          <header className="data-guide-head">
            <div>
              <Dialog.Title className="dialog-title data-guide-title" ref={titleRef} tabIndex={-1}>
                Understand the data
              </Dialog.Title>
              <Dialog.Description className="data-guide-lead">
                What the numbers mean, where they come from and what they cannot tell you. FIREWATCHER is a historical
                hotspot calendar, not a live fire alert service.
              </Dialog.Description>
            </div>
            <Dialog.Close className="button icon-button data-guide-close" aria-label="Close">
              <span aria-hidden="true">✕</span>
            </Dialog.Close>
          </header>

          <nav className="data-guide-nav" aria-label="Sections">
            {SECTIONS.map((section) => (
              <button key={section.id} type="button" className="data-guide-chip" onClick={() => jump(section.id)}>
                {section.label}
              </button>
            ))}
          </nav>

          <div className="dialog-body data-guide-body" ref={bodyRef} tabIndex={0}>
            <section id="dg-hotspot" tabIndex={-1} aria-labelledby="dg-hotspot-h">
              <h3 id="dg-hotspot-h">What a hotspot is</h3>
              <p>
                A <strong>hotspot</strong> is a place where a satellite sensor detected heat on the ground during an
                overpass. It is <strong>not a confirmed fire</strong>, not a number of fires and{" "}
                <strong>not burned area</strong>. One fire can give many detections, and several fires can give one.
              </p>
              <p>
                The dashboard counts hotspots per month, from July 2002 to the current month, for Northeast Brazil. Counts
                are per 0.25° grid cell and are summed over the area you select. Months are local solar months.
              </p>
              <p>Colors are reversed in the dark theme so that the busiest cells always stand out from the basemap; the legend's &ldquo;more&rdquo; end is the busiest.
              </p>
            </section>

            <section id="dg-indicators" tabIndex={-1} aria-labelledby="dg-indicators-h">
              <h3 id="dg-indicators-h">The three indicators</h3>
              <dl className="data-guide-defs">
                <div>
                  <dt>Total activity in the period</dt>
                  <dd>The sum of monthly hotspot counts for your area, years and time of day, on one scale.</dd>
                </div>
                <div>
                  <dt>Peak month</dt>
                  <dd>
                    The single month with the most hotspots in the years you selected (for example September 2024). Next
                    to it, the <strong>usual peak</strong> is the month of the year with the highest median count in the
                    baseline years.
                  </dd>
                </div>
                <div>
                  <dt>Months above usual</dt>
                  <dd>
                    Months whose count is above the median of that month of the year. Each month is compared with the same
                    month in other years, so a busy September is compared with other Septembers, not with March.
                  </dd>
                </div>
              </dl>
              <p>How unusual a month was is measured with a robust z-score:</p>
              <p className="data-guide-formula" aria-label="z equals count minus median, divided by 1.4826 times the MAD">
                z = (count − median) / (1.4826 × MAD)
              </p>
              <p>
                The median and the MAD (median absolute deviation) are taken over the same month of the year in the
                baseline years. Months with <strong>|z| ≥ 2</strong> are flagged as unusual. That threshold is{" "}
                <strong>our product's choice, not a NASA threshold</strong>, not a probability of fire and not a risk
                level. Where a cell has very few hotspots the MAD is small, so z can be extreme or undefined.
              </p>
            </section>

            <section id="dg-harmonized" tabIndex={-1} aria-labelledby="dg-harmonized-h">
              <h3 id="dg-harmonized-h">Harmonized vs native</h3>
              <p>
                Two kinds of satellite sensor saw these years. To compare them, every month is put on one scale, the{" "}
                <strong>VIIRS-equivalent</strong> scale.
              </p>
              <ul>
                <li>
                  <strong>From February 2012:</strong> observed by VIIRS (375 m) on Suomi NPP, or on NOAA-20 put on the
                  same scale where Suomi NPP has a gap.
                </li>
                <li>
                  <strong>Before February 2012:</strong> <em>estimated</em> from MODIS on Aqua, with a model calibrated
                  on 2012–2019, when both sensors were observing. These months are marked as estimated and carry a{" "}
                  <strong>90% interval</strong>.
                </li>
                <li>
                  <strong>Native</strong> views (raw by sensor, the daily view, satellite passes and map sub-cells) show
                  what each satellite actually detected, with no adjustment. VIIRS can detect more hotspots than MODIS
                  over the same fire activity, so the change of sensor can create an artificial jump in the raw record
                  around 2012 (real activity can also change). Use Harmonized to compare years, keeping the model's
                  limits in mind.
                </li>
              </ul>
              <Fold summary="Which detections are counted">
                <p>
                  The main filter keeps presumed vegetation-fire detections with nominal or high confidence, using each
                  sensor's own confidence scale. Provisional near-real-time counts also include nominal- or
                  high-confidence detections whose type is unavailable, so they can include some non-vegetation sources.
                </p>
              </Fold>
            </section>

            <section id="dg-reading" tabIndex={-1} aria-labelledby="dg-reading-h">
              <h3 id="dg-reading-h">How to read the results</h3>
              <ul>
                <li>
                  <strong>Count colors</strong> are steps that each hold about the same number of months, so the legend
                  ranges are not evenly spaced. They are recomputed for the months on screen.
                </li>
                <li>
                  <strong>Anomaly colors</strong> show the robust z-score: blue is below the usual level for that month,
                  orange is above.
                </li>
                <li>
                  <strong>Small dot:</strong> estimated from MODIS. <strong>Corner mark:</strong> partial month (not over
                  yet, or the satellite missed days). <strong>Hatching:</strong> no data, or no estimate. A printed{" "}
                  <strong>0</strong> is a valid count of zero, not missing data.
                </li>
                <li>
                  <strong>The latest month</strong> is unfinished, so it is compared with the same days of earlier
                  years, never with full months.
                </li>
                <li>
                  <strong>Seasonal profile:</strong> the band is where 8 of every 10 years fall for each month (10th to
                  90th percentile); the line is one year. <strong>Trend:</strong> yearly totals, harmonized beside the
                  raw counts of each sensor; only complete years have a total.
                </li>
                <li>
                  <strong>Map sub-cells</strong> (0.0625°, about 7 km) show native detections of the month's source
                  satellite, with the 8 neighboring cells for context. Harmonized estimates exist only at 0.25°. A cell
                  with fewer than 5 detections is not subdivided.
                </li>
                <li>
                  <strong>CSV downloads</strong> hold native NASA FIRMS detections for the selected cells and years,
                  normalized and filtered by this pipeline, with sensor, satellite and product version in every row. They
                  are not harmonized estimates.
                </li>
              </ul>
            </section>

            <section id="dg-sources" tabIndex={-1} aria-labelledby="dg-sources-h">
              <h3 id="dg-sources-h">Sources</h3>
              <dl className="data-guide-meta">
                <div>
                  <dt>Data</dt>
                  <dd>NASA FIRMS: MODIS Collection 6 / 6.1 and VIIRS 375 m Collection 2 active fire products</dd>
                </div>
                <div>
                  <dt>Model version</dt>
                  <dd>{simulated ? "Simulated data (no model)" : (modelVersion ?? "Loading…")}</dd>
                </div>
              </dl>
              <p>
                We acknowledge the use of data from NASA LANCE FIRMS (
                <External href="https://earthdata.nasa.gov/firms">earthdata.nasa.gov/firms</External>), part of the NASA
                Earth Science Data and Information System (ESDIS). The data come without warranty and are not meant for
                tactical or local decisions; see the{" "}
                <External href="https://www.earthdata.nasa.gov/data/projects/lance/disclaimer">LANCE disclaimer</External>.
              </p>
              <ul>
                <li>
                  MODIS detections: Giglio et al. (2003),{" "}
                  <External href="https://doi.org/10.1016/S0034-4257(03)00184-6">
                    An enhanced contextual fire detection algorithm for MODIS
                  </External>
                  .
                </li>
                <li>
                  VIIRS detections: Schroeder et al. (2014),{" "}
                  <External href="https://doi.org/10.1016/j.rse.2013.12.008">
                    The New VIIRS 375 m active fire detection data product
                  </External>
                  .
                </li>
                <li>Basemap: OpenFreeMap, © OpenMapTiles, data from OpenStreetMap contributors.</li>
              </ul>
            </section>

            <section id="dg-limits" tabIndex={-1} aria-labelledby="dg-limits-h">
              <h3 id="dg-limits-h">Limitations</h3>
              <ul>
                <li>
                  <strong>No detection does not mean no fire:</strong> the satellite may not have passed, clouds or smoke
                  may have hidden it, or the fire may have been too small or too short.
                </li>
                <li>
                  MODIS and VIIRS are different instruments. The estimates before 2012 assume that the relation measured
                  in 2012–2019 also held earlier, and there is no VIIRS record to check them against. They cannot recover
                  fire activity that MODIS never saw.
                </li>
                <li>
                  The 90% interval says how far estimates were from VIIRS in years kept out of the calibration. It is not
                  guaranteed coverage for every place or year, and for a summed area it is approximate.
                </li>
                <li>
                  The anomaly classes and the |z| ≥ 2 flag are choices of this product. They are not a NASA threshold, a
                  probability of fire or a risk level. <strong>Nothing here is a forecast or an early warning.</strong>
                </li>
                <li>
                  The study area is a bounding box, not the official Northeast boundary. Grid cells are 0.25° on each
                  side, so they are not equal in area, and a count is not a density.
                </li>
                <li>
                  The latest months come from near-real-time data, which is provisional and later replaced by NASA's
                  standard product.
                </li>
                <li>
                  Medians and anomalies depend on the dataset version and the years included; they are a description of
                  the record, not a fixed climate normal.
                </li>
              </ul>
              <p className="data-guide-note">
                NASA does not endorse this project. It is an exploratory prototype made for the NASA Space Apps
                Challenge, with code written with the help of AI coding assistants. It must not be used on its own for
                emergency, public-safety or resource-allocation decisions.
              </p>
            </section>
          </div>

          <div className="dialog-actions">
            <Dialog.Close className="button">Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
