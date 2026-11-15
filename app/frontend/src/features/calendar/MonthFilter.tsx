import { Popover } from "@base-ui/react/popover";
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
 * The twelve month toggles sit in a small menu, so the calendar toolbar stays one row at every width.
 */
export function MonthFilter({ months, peak, onChange }: MonthFilterProps) {
  const peakActive = peak !== null && sameMonths(months, peak);
  const custom = months.length > 0 && !peakActive;
  return (
    <div className="cal-tool month-filter" role="group" aria-label="Months of the year">
      <span className="control-label">Months</span>
      <div className="segmented">
        <Button
          className="segmented-item"
          aria-label="All months"
          aria-pressed={months.length === 0}
          onClick={() => onChange([])}
        >
          All
        </Button>
        {peak && (
          <Button
            className="segmented-item"
            aria-pressed={peakActive}
            onClick={() => onChange(peakActive ? [] : peak)}
            title={`${monthSpan(peak)}: the three months with the most hotspots in a typical year in this area`}
          >
            Peak: {monthSpan(peak)}
          </Button>
        )}
        <Popover.Root>
          <Popover.Trigger className="segmented-item month-pick" data-active={custom || undefined} aria-label={custom ? `Pick months, now ${monthSpan(months)}` : "Pick months"}>
            {custom ? monthSpan(months) : "Pick"}
            <span className="chip-icon" aria-hidden="true">
              ▾
            </span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner sideOffset={6} align="start" className="popup-positioner">
              <Popover.Popup className="popover month-popover">
                <Popover.Title className="popover-title">Months to compare</Popover.Title>
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
                <p className="popover-note">No month picked shows all twelve.</p>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}
