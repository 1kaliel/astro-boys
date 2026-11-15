import { NumberField } from "@base-ui/react/number-field";
import { useId } from "react";

type CoordinateFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

/**
 * Decimal keypad on phones. Not on iOS: its decimal keypad has no minus key and every coordinate of the study area is
 * negative, so there Base UI's own choice (the full keyboard) stays.
 */
const IOS = typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

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
      // Fixed to en-US: decimal point always. Under pt-BR a typed "-41.5" parsed as -415 and was clamped to -180.
      locale="en-US"
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
        <NumberField.Input
          className="number-field-input"
          aria-labelledby={labelId}
          inputMode={IOS ? undefined : "decimal"}
          enterKeyHint="done"
        />
        <NumberField.Increment className="number-field-step" aria-label={`Increase ${label}`}>
          +
        </NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  );
}
