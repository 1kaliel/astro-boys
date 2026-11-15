import { NumberField } from "@base-ui/react/number-field";
import { useId } from "react";

type CoordinateFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

/** Decimal-degree input (WGS84) with +/- 0.25 degree steps, one L2 cell at a time. */
export function CoordinateField({ label, value, min, max, onChange }: CoordinateFieldProps) {
  const labelId = useId();
  return (
    <NumberField.Root
      className="number-field"
      value={value}
      min={min}
      max={max}
      step={0.25}
      smallStep={0.01}
      format={{ maximumFractionDigits: 2 }}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <span className="control-label" id={labelId}>
        {label}
      </span>
      <NumberField.Group className="number-field-group">
        <NumberField.Decrement className="number-field-step" aria-label={`Decrease ${label}`}>
          −
        </NumberField.Decrement>
        <NumberField.Input className="number-field-input" aria-labelledby={labelId} />
        <NumberField.Increment className="number-field-step" aria-label={`Increase ${label}`}>
          +
        </NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  );
}
