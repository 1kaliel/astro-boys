import { useEffect, useId, useState } from "react";
import { Popover } from "../../components/ui/Popover";
import { formatCount } from "../../lib/format";
import {
  hotspotsCountUrl,
  hotspotsCsvUrl,
  isOverLimit,
  narrowerYearRanges,
  type HotspotsCount,
  type HotspotsRequest,
} from "../../lib/hotspotsCsv";
import { useDashboard, type Period } from "../../state/dashboard";

const PERIOD_TEXT: Record<Period, string> = { ALL: "day and night", D: "day only", N: "night only" };

/** An answer belongs to the `url` it was asked for: under any other selection it is stale and never shown. */
type CountState =
  | { status: "loading" }
  | { status: "error"; url: string; message: string }
  | { status: "ok"; url: string; count: HotspotsCount };

/**
 * D6: CSV of the native hotspots (NASA FIRMS) behind the current view: same cells as the calendar, the years
 * and time of day of the filters. Counts first, so a file that is too large or empty is explained, not sent.
 */
export function DownloadCsv() {
  const [state, dispatch] = useDashboard();
  const [open, setOpen] = useState(false);
  const [includeAll, setIncludeAll] = useState(false);
  const [answer, setAnswer] = useState<CountState>({ status: "loading" });
  const checkboxId = useId();

  const request: HotspotsRequest = {
    area: state.area,
    startYear: state.startYear,
    endYear: state.endYear,
    period: state.period,
    includeAll,
  };
  const countUrl = hotspotsCountUrl(request);
  const count: CountState = answer.status !== "loading" && answer.url !== countUrl ? { status: "loading" } : answer;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setAnswer({ status: "loading" });
    fetch(countUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail ?? `The server answered ${response.status}.`);
        }
        return (await response.json()) as HotspotsCount;
      })
      .then((data) => setAnswer({ status: "ok", url: countUrl, count: data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAnswer({ status: "error", url: countUrl, message: error instanceof Error ? error.message : "Count failed." });
      });
    return () => controller.abort();
  }, [open, countUrl]);

  const years = state.startYear === state.endYear ? `${state.startYear}` : `${state.startYear}–${state.endYear}`;

  return (
    <div className="control">
      <span className="control-label">Download</span>
      <Popover
        open={open}
        onOpenChange={setOpen}
        triggerLabel="Download the native hotspots of this view as CSV"
        title="Native hotspots (NASA FIRMS) as CSV"
        trigger={
          <>
            CSV
            <span className="chip-icon" aria-hidden="true">
              ▾
            </span>
          </>
        }
      >
        <div className="csv-download">
          <p className="csv-note">
            Every detection in the cells of the selected area, {years}, {PERIOD_TEXT[state.period]}. Native values
            as delivered by each sensor (not harmonized); dates are local solar dates, times are UTC.
          </p>
          <label className="csv-option" htmlFor={checkboxId}>
            <input
              id={checkboxId}
              type="checkbox"
              checked={includeAll}
              onChange={(event) => setIncludeAll(event.target.checked)}
            />
            Include detections outside the main filter (low confidence or non-vegetation)
          </label>
          <CountLine count={count} />
          {count.status === "ok" && isOverLimit(count.count) && (
            <div className="csv-suggestions">
              {narrowerYearRanges(state.startYear, state.endYear).map((range) => (
                <button
                  key={range.label}
                  type="button"
                  className="button"
                  onClick={() => dispatch({ type: "setYears", startYear: range.startYear, endYear: range.endYear })}
                >
                  {range.label}
                </button>
              ))}
            </div>
          )}
          {count.status === "ok" && count.count.rows > 0 && !isOverLimit(count.count) && (
            <a className="button" href={hotspotsCsvUrl(request)} download>
              Download CSV
            </a>
          )}
        </div>
      </Popover>
    </div>
  );
}

function CountLine({ count }: { count: CountState }) {
  if (count.status === "loading") {
    return (
      <p className="csv-status" role="status">
        Counting…
      </p>
    );
  }
  if (count.status === "error") {
    return (
      <p className="csv-status" role="alert">
        {count.message}
      </p>
    );
  }
  const { rows, max_rows: max, cells } = count.count;
  if (isOverLimit(count.count)) {
    return (
      <p className="csv-status" role="alert">
        Too large for one file: more than {formatCount(max)} hotspots match, the limit of one CSV. Narrow the
        years or the area.
      </p>
    );
  }
  if (rows === 0) {
    return (
      <p className="csv-status">
        No detections in these cells and years. An absent detection does not confirm that there was no fire.
      </p>
    );
  }
  return (
    <p className="csv-status">
      <strong>{formatCount(rows)}</strong> hotspots in {formatCount(cells)} cells.
    </p>
  );
}
