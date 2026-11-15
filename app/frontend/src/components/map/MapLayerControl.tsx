import type { Sensor } from "../../state/dashboard";
import { InfoTip } from "../ui/InfoTip";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";

type Family = "harmonized" | "modis" | "viirs";

const FAMILIES: ReadonlyArray<SegmentOption<Family>> = [
  { value: "harmonized", label: "VIIRS-equivalent" },
  { value: "modis", label: "MODIS" },
  { value: "viirs", label: "VIIRS" },
];
const MODIS_SATELLITES: ReadonlyArray<SegmentOption<Sensor>> = [
  { value: "aqua", label: "Aqua" },
  { value: "terra", label: "Terra" },
];
const VIIRS_SATELLITES: ReadonlyArray<SegmentOption<Sensor>> = [
  { value: "snpp", label: "S-NPP" },
  { value: "n20", label: "NOAA-20" },
];

const familyOf = (sensor: Sensor): Family =>
  sensor === "harmonized" ? "harmonized" : sensor === "aqua" || sensor === "terra" ? "modis" : "viirs";

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
  harmonized: "Harmonized series of the calendar, comparable across 2002 to today.",
  modis: "Native MODIS detections, 1 km pixels, Aqua and Terra apart. Not comparable with VIIRS counts.",
  viirs: "Native VIIRS detections, 375 m pixels, S-NPP and NOAA-20 apart. Months a satellite has no data for stay empty. Not comparable with MODIS counts.",
};

/**
 * The layer of the map: the harmonized VIIRS-equivalent series, or the native detections of one instrument and
 * satellite. Instruments are never added together, and a satellite is never mixed into another's layer.
 */
export function MapLayerControl({ sensor, onSensor }: { sensor: Sensor; onSensor: (sensor: Sensor) => void }) {
  const family = familyOf(sensor);
  return (
    <div className="map-layers" role="group" aria-label="Map layer">
      <SegmentedControl
        label="Map layer"
        hideLabel
        options={FAMILIES}
        value={family}
        onChange={(next) => onSensor(next === "harmonized" ? "harmonized" : next === "modis" ? "aqua" : "snpp")}
      />
      {family !== "harmonized" && (
        <SegmentedControl
          label="Satellite"
          hideLabel
          options={family === "modis" ? MODIS_SATELLITES : VIIRS_SATELLITES}
          value={sensor}
          onChange={onSensor}
        />
      )}
      <InfoTip label="About this map layer">{NOTE[family]}</InfoTip>
    </div>
  );
}
