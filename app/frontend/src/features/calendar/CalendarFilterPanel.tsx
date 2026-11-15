import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { formatCount } from "../../lib/format";
import { useDashboard } from "../../state/dashboard";
import {
  DEVIATION_BANDS,
  SHORTCUTS,
  activeFilterCount,
  activeShortcut,
  shortcutRange,
  type DeviationBand,
} from "./calendarFilters";
import { monthLong } from "./calendarText";

type Props = {
  /** The last month with a row in the data, as a month index; shortcuts count back from it. */
  latest: number | null;
  firstYear: number;
  /** The harmonized series only has deviation; the raw series has no median. */
  deviationAvailable: boolean;
  /** Months with data, and how many match the filters. */
  matches: { total: number; matching: number };
  /** Labels of the legend colors picked, in words. */
  legendLabels: readonly string[];
  /** The month on the map when an active filter hides it. */
  hiddenSelected: { year: number; month: number } | null;
  unit: string;
};

const parse = (text: string): number | null => {
  const clean = text.replace(/[,\s]/g, "");
  if (clean === "") return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Shortcuts, the volume range, the deviation bands, the palette, and the summary of what is active. */
export function CalendarFilterPanel({
  latest,
  firstYear,
  deviationAvailable,
  matches,
  legendLabels,
  hiddenSelected,
  unit,
}: Props) {
  const [state, dispatch] = useDashboard();
  const f = state.filters;
  const [minText, setMinText] = useState(f.volumeMin?.toString() ?? "");
  const [maxText, setMaxText] = useState(f.volumeMax?.toString() ?? "");
  useEffect(() => {
    setMinText(f.volumeMin?.toString() ?? "");
    setMaxText(f.volumeMax?.toString() ?? "");
  }, [f.volumeMin, f.volumeMax]);

  const current = activeShortcut(state.startYear, state.endYear, f.range, latest, firstYear);
  const apply = () => dispatch({ type: "setVolume", min: parse(minText), max: parse(maxText) });
  const toggleBand = (band: DeviationBand) =>
    dispatch({
      type: "setDeviation",
      bands: f.deviation.includes(band) ? f.deviation.filter((b) => b !== band) : [...f.deviation, band],
    });
  const count = activeFilterCount(f);

  const active: string[] = [];
  if (f.range) active.push(`Window: ${current === "latest12" ? "latest 12 months" : "custom"}`);
  if (f.volumeMin !== null || f.volumeMax !== null)
    active.push(
      `Volume: ${f.volumeMin !== null ? formatCount(f.volumeMin) : "0"} to ${f.volumeMax !== null ? formatCount(f.volumeMax) : "no limit"}`,
    );
  if (f.deviation.length > 0)
    active.push(
      `Deviation: ${DEVIATION_BANDS.filter((b) => f.deviation.includes(b.band))
        .map((b) => b.label.toLowerCase())
        .join(", ")}`,
    );
  if (f.legend.length > 0) active.push(`Colors: ${legendLabels.join(", ") || f.legend.length + " picked"}`);

  return (
    <div className="calendar-filters" role="group" aria-label="Calendar filters: range, volume and deviation">
      <div>
        <span className="control-label">Range</span>
        <div className="calendar-filters-row">
          {SHORTCUTS.map(({ id, label }) => (
            <Button
              key={id}
              className="chip"
              aria-pressed={current === id}
              disabled={latest === null}
              onClick={() => {
                if (latest === null) return;
                const r = shortcutRange(id, latest, firstYear);
                dispatch({ type: "setRange", ...r });
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <span className="control-label">Volume: hotspot detections in a month</span>
        <div className="calendar-volume">
          <label>
            Min
            <input
              inputMode="numeric"
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
              onBlur={apply}
              placeholder="0"
            />
          </label>
          <label>
            Max
            <input
              inputMode="numeric"
              value={maxText}
              onChange={(e) => setMaxText(e.target.value)}
              onBlur={apply}
              placeholder="no limit"
            />
          </label>
        </div>
        <p className="calendar-filters-hint">
          {unit}. Fire radiative power (FRP) is a different measure and is not in this filter.
        </p>
      </form>

      <div>
        <span className="control-label">Deviation from the historical reference</span>
        {deviationAvailable ? (
          <>
            <div className="calendar-filters-row">
              {DEVIATION_BANDS.map(({ band, label, limits }) => (
                <Button
                  key={band}
                  className="chip"
                  aria-pressed={f.deviation.includes(band)}
                  title={limits}
                  onClick={() => toggleBand(band)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <p className="calendar-filters-hint">
              Robust z-score of the month against the median of that month of the year: below z ≤ −1, near between −1
              and +1, above z ≥ +1. Months without a comparison are their own group.
            </p>
          </>
        ) : (
          <p className="calendar-filters-hint">Only for the harmonized series: raw counts have no historical median.</p>
        )}
      </div>

      <div>
        <span className="control-label">Colors</span>
        <div className="calendar-filters-row">
          <Button
            className="chip"
            aria-pressed={state.palette === "contrast"}
            onClick={() =>
              dispatch({ type: "setPalette", palette: state.palette === "contrast" ? "default" : "contrast" })
            }
          >
            High contrast
          </Button>
        </div>
      </div>

      {count > 0 && (
        <div className="calendar-active" role="status" aria-live="polite">
          <strong>
            {matches.matching} of {matches.total} months match
          </strong>
          <ul aria-label="Active filters">
            {active.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          {matches.matching === 0 && (
            <p className="calendar-filters-hint">No month meets these criteria. Widen the range or clear a filter.</p>
          )}
          {hiddenSelected && (
            <p className="calendar-filters-hint">
              The map still shows {monthLong(hiddenSelected.month)} {hiddenSelected.year}, which the filters hide here.
            </p>
          )}
          <Button className="chip" onClick={() => dispatch({ type: "clearFilters" })}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
