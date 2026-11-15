import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import type { CalendarDataset, CalendarMonth } from "../../data/calendarSource";
import { formatCount } from "../../lib/format";
import { latestKpiText } from "../../lib/metrics";
import { useDashboard, type Period, type Sensor } from "../../state/dashboard";
import { sensorName } from "../calendar/calendarModel";
import { monthLong } from "../calendar/calendarText";
import { compareMonths, monthBounds, shiftMonth } from "../calendar/monthModel";
import { describeArea } from "./AreaPicker";

export type MonthRef = { year: number; month: number };

const PERIOD_TEXT: Record<Period, string> = { ALL: "day and night", D: "day only", N: "night only" };
const NATIVE: Record<Exclude<Sensor, "harmonized">, string> = {
  aqua: "native MODIS Aqua counts, not harmonized",
  terra: "native MODIS Terra counts, not harmonized",
  snpp: "native S-NPP VIIRS counts, not harmonized",
  n20: "native NOAA-20 VIIRS counts, not harmonized",
};

/** The month every view shows: the one picked, else the latest month of the data. */
export function currentMonth(selected: MonthRef | null, dataset: CalendarDataset | null): MonthRef | null {
  if (selected) return selected;
  if (!dataset) return null;
  const last = monthBounds(dataset.months)?.last;
  return last ?? null;
}

export function monthEntry(dataset: CalendarDataset | null, ref: MonthRef | null, period: Period): CalendarMonth | null {
  if (!dataset || !ref) return null;
  return (
    dataset.months.find((m) => m.year === ref.year && m.month === ref.month && (m.period ?? period) === period) ??
    dataset.months.find((m) => m.year === ref.year && m.month === ref.month) ??
    null
  );
}

/**
 * "You're looking at": what the map and the numbers show, in one sentence built from the state, always on top of
 * the sidebar. Under it, one plain line on how to read a cell.
 */
export function LookingAt({ month, entry }: { month: MonthRef | null; entry: CalendarMonth | null }) {
  const [state] = useDashboard();
  const area = describeArea(state.area, state.areaLabel);
  const where = area.kind === "study" ? "Northeast Brazil (study area)" : area.text;
  const what =
    state.sensor === "harmonized" ? "VIIRS-equivalent hotspots per 0.25° cell" : `${NATIVE[state.sensor]}, per 0.25° cell`;
  const when = month ? `${monthLong(month.month)} ${month.year}` : "the latest month";
  const source =
    state.sensor !== "harmonized" || !entry
      ? null
      : entry.isEstimated
        ? "estimated from MODIS Aqua"
        : `observed by ${entry.sourceSatellite ? sensorName(entry.sourceSatellite) : "VIIRS"}`;
  return (
    <section className="xp-looking" aria-label="What the map shows">
      <p className="xp-eyebrow">You're looking at</p>
      <p className="xp-sentence" aria-live="polite">
        <strong>{what}</strong> · {where} · <strong>{when}</strong> · {PERIOD_TEXT[state.period]}
        {source ? ` · ${source}` : ""}
      </p>
      <p className="xp-explain">
        Each square is a 28 km cell; its color is the number of satellite hotspot detections that month (thermal
        detections, not confirmed fires).
      </p>
    </section>
  );
}

/** ◀ September 2024 ▶: steps the one month that drives the map, the numbers and the days. */
export function MonthStepper({ month, dataset }: { month: MonthRef | null; dataset: CalendarDataset | null }) {
  const [, dispatch] = useDashboard();
  const bounds = dataset ? monthBounds(dataset.months) : null;
  if (!month) return <p className="xp-month-title">Loading…</p>;
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const canPrev = !bounds || compareMonths(prev, bounds.first) >= 0;
  const canNext = !bounds || compareMonths(next, bounds.last) <= 0;
  const go = (to: MonthRef) => dispatch({ type: "openMonth", year: to.year, month: to.month });
  return (
    <div className="xp-stepper" role="group" aria-label="Month">
      <Button
        className="xp-step-button"
        disabled={!canPrev}
        aria-label={`Previous month: ${monthLong(prev.month)} ${prev.year}`}
        onClick={() => go(prev)}
      >
        <span aria-hidden="true">◀</span>
      </Button>
      <p className="xp-month-title" aria-live="polite">
        {monthLong(month.month)} {month.year}
      </p>
      <Button
        className="xp-step-button"
        disabled={!canNext}
        aria-label={`Next month: ${monthLong(next.month)} ${next.year}`}
        onClick={() => go(next)}
      >
        <span aria-hidden="true">▶</span>
      </Button>
      {bounds && compareMonths(month, bounds.last) < 0 && (
        <Button className="xp-latest" onClick={() => go(bounds.last)}>
          Latest
        </Button>
      )}
    </div>
  );
}

/** The selected month in numbers: the harmonized count of the area and how it compares with its usual level. */
export function ThisMonth({ month, entry }: { month: MonthRef | null; entry: CalendarMonth | null }) {
  if (!month) return null;
  const text = entry ? latestKpiText(entry) : null;
  return (
    <section className="xp-this-month" aria-label="This month">
      <p className="xp-eyebrow">This month in the area</p>
      <p className="xp-big">{entry ? (entry.count === null ? "No estimate" : formatCount(entry.count)) : "No data"}</p>
      {text && <p className="xp-detail">{text.detail}</p>}
      {text?.comparison && <p className="xp-comparison">{text.comparison}</p>}
      {entry && (entry.isEstimated || entry.isPartial) && (
        <p className="xp-badges">
          {entry.isEstimated && <Badge kind="estimated" />}
          {entry.isPartial && <Badge kind="partial">{`Partial: ${entry.daysObserved} days so far`}</Badge>}
        </p>
      )}
    </section>
  );
}
