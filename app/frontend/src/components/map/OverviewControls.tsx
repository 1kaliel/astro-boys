type OverviewControlsProps = {
  showThermal: boolean;
  onShowThermal: (on: boolean) => void;
  showHotspots: boolean;
  onShowHotspots: (on: boolean) => void;
  opacity: number;
  onOpacity: (value: number) => void;
};

/**
 * Controls of the overview: the temperature surface and the hotspots can be shown or hidden and the surface opacity
 * adjusted. The live wind has no switch on purpose: it is always on while the map is visible (static arrows when the
 * device asks for reduced motion).
 */
export function OverviewControls(props: OverviewControlsProps) {
  return (
    <div className="overview-controls" role="group" aria-label="Overview layers">
      <label className="overview-check">
        <input type="checkbox" checked={props.showThermal} onChange={(e) => props.onShowThermal(e.target.checked)} />
        Temperature
      </label>
      <label className="overview-check">
        <input type="checkbox" checked={props.showHotspots} onChange={(e) => props.onShowHotspots(e.target.checked)} />
        Hotspots
      </label>
      <label className="overview-slider">
        <span>Temperature opacity</span>
        <input
          type="range"
          min={0.2}
          max={0.9}
          step={0.05}
          value={props.opacity}
          disabled={!props.showThermal}
          aria-valuetext={`${Math.round(props.opacity * 100)}%`}
          onChange={(e) => props.onOpacity(Number(e.target.value))}
        />
      </label>
      <span className="overview-wind-note">Live wind: always on</span>
    </div>
  );
}
