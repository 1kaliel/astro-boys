import { checkArea } from "../../lib/area";
import { PILOT_BOUNDS, type Bounds } from "../../state/dashboard";

/**
 * Geography of the filter bar: Region → Country → State. Only the Northeast Brazil study box has data, so every
 * other region and country is listed but disabled ("no data"), and a state is an APPROXIMATE bounding box around it,
 * clamped to the study box. A box is a rectangle, not the state border: cells of neighbouring states are included.
 */
export type GeoOption = { id: string; name: string; enabled: boolean };

export const REGIONS: readonly GeoOption[] = [
  { id: "south-america", name: "South America", enabled: true },
  { id: "africa", name: "Africa", enabled: false },
  { id: "asia", name: "Asia", enabled: false },
  { id: "europe", name: "Europe", enabled: false },
  { id: "north-america", name: "North and Central America", enabled: false },
  { id: "oceania", name: "Oceania", enabled: false },
];

export const COUNTRIES: readonly GeoOption[] = [
  { id: "brazil", name: "Brazil", enabled: true },
  ...["Argentina", "Bolivia", "Chile", "Colombia", "Ecuador", "Guyana", "Paraguay", "Peru", "Suriname", "Uruguay", "Venezuela"].map(
    (name) => ({ id: name.toLowerCase(), name, enabled: false }),
  ),
];

export type StatePreset = {
  id: string;
  name: string;
  /** Two-letter state code (UF). */
  uf: string;
  /** Approximate box around the state (west, south, east, north), before clamping to the study box. */
  box: Bounds;
};

const box = (west: number, south: number, east: number, north: number): Bounds => ({ west, south, east, north });

export const STATE_PRESETS: readonly StatePreset[] = [
  { id: "ma", uf: "MA", name: "Maranhão", box: box(-48.8, -10.3, -41.8, -1.0) },
  { id: "pi", uf: "PI", name: "Piauí", box: box(-46.0, -10.95, -40.35, -2.7) },
  { id: "ce", uf: "CE", name: "Ceará", box: box(-41.45, -7.9, -37.25, -2.75) },
  { id: "rn", uf: "RN", name: "Rio Grande do Norte", box: box(-38.6, -7.0, -34.95, -4.8) },
  { id: "pb", uf: "PB", name: "Paraíba", box: box(-38.8, -8.3, -34.75, -6.0) },
  { id: "pe", uf: "PE", name: "Pernambuco", box: box(-41.4, -9.5, -34.8, -7.25) },
  { id: "al", uf: "AL", name: "Alagoas", box: box(-38.25, -10.5, -35.15, -8.8) },
  { id: "se", uf: "SE", name: "Sergipe", box: box(-38.25, -11.6, -36.4, -9.5) },
  { id: "ba", uf: "BA", name: "Bahia", box: box(-46.65, -18.4, -37.3, -8.5) },
];

/** Name of the whole study box, as the filter and the chips show it. */
export const STUDY_AREA_LABEL = "All Northeast (study area)";

/** The label dispatched with the area: "Ceará (approximate box)". */
export function presetLabel(preset: StatePreset): string {
  return `${preset.name} (approximate box)`;
}

/** The area a preset selects: its box clamped to the study box (the same rule as every other way to pick an area). */
export function presetArea(preset: StatePreset): { area: Bounds; cells: number } {
  const check = checkArea(preset.box, PILOT_BOUNDS);
  if (!check.ok) throw new Error(`State preset ${preset.id} is outside the study area: ${check.message}`);
  return { area: check.area, cells: check.cells };
}

/** The preset whose label is `label`, if the current area came from one. */
export function presetForLabel(label: string | null): StatePreset | undefined {
  return label ? STATE_PRESETS.find((preset) => presetLabel(preset) === label) : undefined;
}
