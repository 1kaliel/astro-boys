import { DATA_SERIES, DATA_SERIES_LABEL, dataSeriesActions, dataSeriesOf, satelliteActions, type DataSeries } from "../../lib/dataSeries";
import { useDashboard, type Sensor } from "../../state/dashboard";
import { InfoTip } from "../ui/InfoTip";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";

type Family = DataSeries;

const FAMILIES: ReadonlyArray<SegmentOption<Family>> = DATA_SERIES.map((value) => ({
  value,
  label: DATA_SERIES_LABEL[value].short,
}));
const MODIS_SATELLITES: ReadonlyArray<SegmentOption<Sensor>> = [
  { value: "aqua", label: "Aqua" },
  { value: "terra", label: "Terra" },
];
const VIIRS_SATELLITES: ReadonlyArray<SegmentOption<Sensor>> = [
  { value: "snpp", label: "S-NPP" },
  { value: "n20", label: "NOAA-20" },
];

/** What a count of this layer is, for the legend. */
export function layerUnit(sensor: Sensor): string {
  switch (sensor) {
    case "harmonized":
      return "VIIRS-equivalent hotspots (harmonized: months before February 2012 are estimated from MODIS)";
    case "aqua":
      return "Native hotspot detections of Aqua MODIS (1 km), not harmonized";
    case "terra":
      return "Native hotspot detections of Terra MODIS (1 km), not harmonized";
    case "snpp":
      return "Native hotspot detections of S-NPP VIIRS (375 m), not harmonized";
    case "n20":
      return "Native hotspot detections of NOAA-20 VIIRS (375 m), not harmonized";
  }
}

/** Short noun for a cell chip: "12 native S-NPP VIIRS detections". */
export function layerCountLabel(sensor: Sensor): string {
  switch (sensor) {
    case "harmonized":
      return "VIIRS-equivalent hotspots";
    case "aqua":
      return "native Aqua MODIS detections";
    case "terra":
      return "native Terra MODIS detections";
    case "snpp":
      return "native S-NPP VIIRS detections";
    case "n20":
      return "native NOAA-20 VIIRS detections";
  }
}

const NOTE: Record<Family, string> = {
  harmonized: "Harmonized (VIIRS-equivalent): the series of the calendar, comparable from 2002 to today.",
  modis: "Native MODIS detections, 1 km pixels, Aqua and Terra apart. Not comparable with VIIRS counts.",
  viirs: "Native VIIRS detections, 375 m pixels, S-NPP and NOAA-20 apart. Months a satellite has no data for stay empty. Not comparable with MODIS counts.",
};

/**
 * The data switch of the explorer, on the map (the primary control): the harmonized VIIRS-equivalent series, or the
 * native detections of one instrument and satellite. It is the same choice as the sidebar's "Data" step: both set the
 * calendar scale and the map layer together (lib/dataSeries). Instruments are never added together, and a satellite
 * is never mixed into another's layer. `sensor`/`onSensor` are accepted for compatibility; the state is the source.
 */
export function MapLayerControl(_props: { sensor?: Sensor; onSensor?: (sensor: Sensor) => void }) {
  const [state, dispatch] = useDashboard();
  const sensor = state.sensor;
  const family = dataSeriesOf(state);
  const run = (actions: ReturnType<typeof satelliteActions>) => actions.forEach((action) => dispatch(action));
  return (
    <div className="map-layers" role="group" aria-label="Data">
      <SegmentedControl
        label="Data"
        hideLabel
        options={FAMILIES}
        value={family}
        onChange={(next) => run(dataSeriesActions(next, sensor))}
      />
      {family !== "harmonized" && (
        <SegmentedControl
          label="Satellite"
          hideLabel
          options={family === "modis" ? MODIS_SATELLITES : VIIRS_SATELLITES}
          value={sensor}
          onChange={(next) => run(satelliteActions(next))}
        />
      )}
      <InfoTip label="About the data">{NOTE[family]}</InfoTip>
    </div>
  );
}
