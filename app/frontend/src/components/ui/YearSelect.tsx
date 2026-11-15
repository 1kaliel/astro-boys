import { Select } from "@base-ui/react/select";

type YearSelectProps = {
  label: string;
  value: number;
  years: readonly number[];
  onChange: (year: number) => void;
  /** Keep the label for screen readers only (two selects share one visible label). */
  hideLabel?: boolean;
};

export function YearSelect({ label, value, years, onChange, hideLabel }: YearSelectProps) {
  return (
    <div className="control">
      <span className={hideLabel ? "sr-only" : "control-label"}>{label}</span>
      <Select.Root
        value={value}
        onValueChange={(next) => {
          if (typeof next === "number") onChange(next);
        }}
      >
        <Select.Trigger className="select-trigger" aria-label={label}>
          <Select.Value />
          <Select.Icon className="select-icon" aria-hidden="true">
            ▾
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4} className="popup-positioner">
            <Select.Popup className="select-popup">
              {years.map((year) => (
                <Select.Item key={year} value={year} className="select-item">
                  <Select.ItemText>{year}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
