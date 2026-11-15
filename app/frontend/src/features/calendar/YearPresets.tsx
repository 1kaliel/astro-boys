import { Button } from "../../components/ui/Button";
import { activePreset, presetRanges } from "../../lib/yearRanges";

type YearPresetsProps = {
  /** Years the data covers. */
  firstYear: number;
  lastYear: number;
  /** The years on screen. */
  startYear: number;
  endYear: number;
  onChange: (startYear: number, endYear: number) => void;
};

/**
 * Quick year ranges above the calendar: the grid has one row per year, so 25 years is a very tall card.
 * The pressed button is the range on screen; a custom range (From / To in the filter bar) leaves none pressed.
 */
export function YearPresets({ firstYear, lastYear, startYear, endYear, onChange }: YearPresetsProps) {
  const presets = presetRanges(firstYear, lastYear);
  const active = activePreset(presets, startYear, endYear);
  return (
    <div className="cal-tool year-presets" role="group" aria-label="Years shown">
      <span className="control-label">Years</span>
      <div className="segmented">
        {presets.map((preset) => (
          <Button
            key={preset.id}
            className="segmented-item"
            aria-pressed={active?.id === preset.id}
            title={`${preset.startYear}–${preset.endYear}`}
            onClick={() => onChange(preset.startYear, preset.endYear)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
