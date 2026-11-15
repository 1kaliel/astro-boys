import type { ReactNode } from "react";
import { InfoDialog } from "../../components/ui/InfoDialog";
import { EXTENT } from "../../lib/extent";

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/**
 * "How to read / limitations / sources" panel (task D10). The facts come from docs/methodology.md, the data
 * contract and the FIRMS citation guidance in docs/resources.md; keep the three in step when one changes.
 * Words: "hotspots" or "fire activity", never "fires" or "burned area"; a z-score is never a probability.
 */
export function AboutDialog() {
  return (
    <InfoDialog triggerLabel="How to read" title="How to read this dashboard">
      <h3>What is shown</h3>
      <p>
        Monthly counts of <strong>hotspots</strong>: places where a satellite sensor detected heat on the ground, from
        July 2002 to the current month, for {EXTENT.name}. Counts are per 0.25° grid cell and are summed over the area
        you select. Every month is on one scale, the <strong>VIIRS-equivalent</strong> scale, so years before and after
        the change of sensor in 2012 can be compared.
      </p>
      <ul>
        <li>
          <strong>From February 2012:</strong> observed by VIIRS (375 m) on the Suomi NPP satellite, or on NOAA-20, put on
          the same scale, where Suomi NPP has a gap.
        </li>
        <li>
          <strong>Before February 2012:</strong> estimated from MODIS on the Aqua satellite, with a model calibrated on
          2012–2019, when both sensors were observing. These months are marked as estimated and carry a 90% interval.
        </li>
        <li>
          Only detections that FIRMS classes as presumed vegetation fire, with nominal or high confidence, are counted.
          Months are local solar months.
        </li>
      </ul>

      <h3>Reading the calendar</h3>
      <ul>
        <li>One row per year, one square per month. A darker square has more hotspots.</li>
        <li>
          The colors are steps that each hold about the same number of months, so the ranges in the legend are not
          evenly spaced. They are recomputed for the months on screen.
        </li>
        <li>
          <strong>Small dot:</strong> estimated from MODIS. <strong>Corner mark:</strong> partial month (the month is not
          over, or the satellite missed days). <strong>Hatching:</strong> no data, or no estimate. A printed{" "}
          <strong>0</strong> is a valid count of zero, not missing data.
        </li>
        <li>Pick a square to see that month on the map and that year in the seasonal profile.</li>
      </ul>

      <h3>The views</h3>
      <ul>
        <li>
          <strong>Count or Anomaly.</strong> Anomaly colors each month by how far it is from the median of that month of
          the year (a robust z-score): blue is below, orange is above. It says how unusual a month was.
        </li>
        <li>
          <strong>Harmonized or Raw by sensor.</strong> Raw shows what each satellite counted, with no adjustment. VIIRS
          detects several times more hotspots than MODIS over the same fire activity, so the raw record jumps in 2012.
          That jump is the change of instrument. Use Harmonized to compare years.
        </li>
        <li>
          <strong>All, Day or Night</strong> keeps the detections of the daytime or the nighttime overpasses.
        </li>
        <li>
          <strong>Latest month.</strong> An unfinished month is compared with the same days of earlier years, never with
          full months.
        </li>
        <li>
          <strong>Seasonal profile.</strong> The band is where 8 of every 10 years fall for each month (10th to 90th
          percentile); the line is one year.
        </li>
        <li>
          <strong>Trend.</strong> Yearly totals, harmonized next to the raw counts of each sensor. Only complete years
          have a total.
        </li>
        <li>
          <strong>CSV.</strong> The original detections of the area and years, as delivered by NASA FIRMS, with sensor,
          satellite and product version in every row.
        </li>
      </ul>

      <h3>Limitations</h3>
      <ul>
        <li>
          A hotspot is a satellite thermal detection. It is <strong>not a confirmed fire</strong>, not a number of fires
          and <strong>not burned area</strong>. One fire can give many detections, and several fires can give one.
        </li>
        <li>
          No detection does not mean there was no fire: the satellite may not have passed, clouds or smoke may have
          hidden it, or the fire may have been too small or too short.
        </li>
        <li>
          MODIS and VIIRS are different instruments. The estimates before 2012 assume that the relation measured between
          them in 2012–2019 also held earlier. They cannot recover fire activity that MODIS never saw. The interval says
          how far estimates were from VIIRS in years kept out of the calibration; for an area it is approximate.
        </li>
        <li>
          The anomaly classes are a choice of this product. They are not a NASA threshold, not a probability of fire and
          not a risk level. Nothing here is a forecast.
        </li>
        <li>Grid cells are 0.25° on each side, so they are not equal in area.</li>
        <li>The latest months come from near-real-time data, which NASA later replaces with the standard product.</li>
      </ul>

      <h3>Sources and credits</h3>
      <p>
        We acknowledge the use of data from NASA LANCE FIRMS (
        <External href="https://earthdata.nasa.gov/firms">earthdata.nasa.gov/firms</External>), part of the NASA Earth
        Science Data and Information System (ESDIS): MODIS Collection 6 / 6.1 and VIIRS 375 m Collection 2 active fire
        products. The data come without warranty and are not meant for tactical or local decisions; see the{" "}
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
      <p>
        NASA does not endorse this project. It is an exploratory prototype made for the NASA Space Apps Challenge, with
        code written with the help of AI coding assistants. It must not be used on its own for emergency, public-safety
        or resource-allocation decisions.
      </p>
    </InfoDialog>
  );
}
