import { Select } from "@base-ui/react/select";

type YearSelectProps = {
  label: string;
  value: number;
  years: readonly number[];
  onChange: (year: number) => void;
};

export function YearSelect({ label, value, years, onChange }: YearSelectProps) {
  return (
    <div className="control">
      <span className="control-label">{label}</span>
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
          <Select.Positioner sideOffset={4}>
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
