import { InfoDialog } from "../../components/ui/InfoDialog";

/**
 * "How to read / limitations / sources" panel. First draft from the specs; Jean owns the final text (task D10).
 * TODO(D10): add the FIRMS disclaimer link referenced in AttributesReadme.txt.
 */
export function AboutDialog() {
  return (
    <InfoDialog triggerLabel="How to read" title="How to read this dashboard">
      <h3>What is shown</h3>
      <p>
        Monthly counts of hotspot detections per 0.25° grid cell, in a single VIIRS-equivalent scale, summed over the
        area you select. Cells are summed first; the median and anomalies are computed on that sum.
      </p>
      <h3>Limitations</h3>
      <ul>
        <li>
          A hotspot is a satellite thermal detection. It is not a confirmed fire and not burned area. No detection does
          not mean there was no fire (no overpass, clouds, or a fire too small to detect).
        </li>
        <li>
          From February 2012 the values are observed by VIIRS. Earlier months are estimated from MODIS (Aqua) and carry
          an interval. Estimated months are outlined with a dashed line.
        </li>
        <li>
          Estimates assume the relation between sensors measured in 2012–2019 also held in 2002–2011. They cannot
          recover fires MODIS never saw.
        </li>
        <li>Anomaly bands are a product choice, not a NASA threshold and not a probability. This is not a forecast.</li>
        <li>Grid cells are not equal-area: they get smaller away from the equator.</li>
      </ul>
      <h3>Sources</h3>
      <p>
        Data: NASA FIRMS (LANCE), MODIS (Collection 6 / 6.1) and VIIRS 375 m (Collection 2) active fire products,{" "}
        <a href="https://earthdata.nasa.gov/firms" target="_blank" rel="noreferrer">
          earthdata.nasa.gov/firms
        </a>
        . NASA does not endorse this project.
      </p>
      <p>
        This prototype is exploratory. It must not be used on its own for emergency, public-safety or resource-allocation
        decisions.
      </p>
    </InfoDialog>
  );
}
