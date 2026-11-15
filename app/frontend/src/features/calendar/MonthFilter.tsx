import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Button } from "../../components/ui/Button";
import { monthSpan } from "./calendarModel";
import { monthLong, monthShort } from "./calendarText";

type MonthFilterProps = {
  /** Months shown (1..12). Empty means every month. */
  months: readonly number[];
  /** The three consecutive months with the most hotspots in this area and period, when known. */
  peak: readonly number[] | null;
  onChange: (months: readonly number[]) => void;
};

const sameMonths = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((month) => b.includes(month));

/**
 * Pick the months of the year to compare, for example the same season in every year.
 * No month pressed = all twelve. "Peak" selects the three strongest consecutive months of the area on screen.
 */
export function MonthFilter({ months, peak, onChange }: MonthFilterProps) {
  const peakActive = peak !== null && sameMonths(months, peak);
  return (
    <div className="month-filter" role="group" aria-label="Months of the year">
      <div className="month-filter-head">
        <span className="control-label">Months</span>
        <Button className="chip" aria-label="All months" aria-pressed={months.length === 0} onClick={() => onChange([])}>
          All
        </Button>
        {peak && (
          <Button
            className="chip"
            aria-pressed={peakActive}
            onClick={() => onChange(peakActive ? [] : peak)}
            title={`${monthSpan(peak)}: the three months with the most hotspots in a typical year in this area`}
          >
            Peak: {monthSpan(peak)}
          </Button>
        )}
      </div>
      <ToggleGroup
        multiple
        className="month-chips"
        aria-label="Pick months"
        value={months.map(String)}
        onValueChange={(next) => onChange(next.map(Number))}
      >
        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
          <Toggle key={month} value={String(month)} className="month-chip" aria-label={monthLong(month)}>
            {monthShort(month)}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}
