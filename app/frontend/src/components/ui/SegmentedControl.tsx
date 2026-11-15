import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

export type SegmentOption<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  label: string;
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Keep the label for screen readers only (e.g. on the map toolbar). */
  hideLabel?: boolean;
};

/** Single-choice toggle group (e.g. Day / Night / All). One option is always selected. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  hideLabel,
}: SegmentedControlProps<T>) {
  return (
    <div className="control">
      <span className={hideLabel ? "sr-only" : "control-label"}>{label}</span>
      <ToggleGroup
        className="segmented"
        aria-label={label}
        value={[value]}
        onValueChange={(next) => {
          const picked = next[0];
          if (picked !== undefined) onChange(picked as T);
        }}
      >
        {options.map((option) => (
          <Toggle key={option.value} value={option.value} className="segmented-item">
            {option.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}
