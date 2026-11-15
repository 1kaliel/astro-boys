import { useEffect, useId, useState } from "react";
import { Popover } from "../../components/ui/Popover";
import { formatCount } from "../../lib/format";
import { hotspotsCountUrl, hotspotsCsvUrl, type HotspotsCount, type HotspotsRequest } from "../../lib/hotspotsCsv";
import { useDashboard, type Period } from "../../state/dashboard";

const PERIOD_TEXT: Record<Period, string> = { ALL: "day and night", D: "day only", N: "night only" };

type CountState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; count: HotspotsCount };

/**
 * D6: CSV of the native hotspots (NASA FIRMS) behind the current view: same cells as the calendar, the years
 * and time of day of the filters. Counts first, so a file that is too large or empty is explained, not sent.
 */
export function DownloadCsv() {
  const [state] = useDashboard();
  const [open, setOpen] = useState(false);
  const [includeAll, setIncludeAll] = useState(false);
  const [count, setCount] = useState<CountState>({ status: "loading" });
  const checkboxId = useId();

  const request: HotspotsRequest = {
    area: state.area,
    startYear: state.startYear,
    endYear: state.endYear,
    period: state.period,
    includeAll,
  };
  const countUrl = hotspotsCountUrl(request);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setCount({ status: "loading" });
    fetch(countUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail ?? `The server answered ${response.status}.`);
        }
        return (await response.json()) as HotspotsCount;
      })
      .then((data) => setCount({ status: "ok", count: data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCount({ status: "error", message: error instanceof Error ? error.message : "Count failed." });
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
          {count.status === "ok" && count.count.rows > 0 && count.count.rows <= count.count.max_rows && (
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
  if (count.status === "loading") return <p className="csv-status">Counting hotspots…</p>;
  if (count.status === "error") {
    return (
      <p className="csv-status" role="alert">
        {count.message}
      </p>
    );
  }
  const { rows, max_rows: max, cells } = count.count;
  if (rows === 0) {
    return (
      <p className="csv-status">
        No detections in these cells and years. An absent detection does not confirm that there was no fire.
      </p>
    );
  }
  if (rows > max) {
    return (
      <p className="csv-status" role="alert">
        {formatCount(rows)} hotspots: more than the {formatCount(max)} one file can hold. Narrow the area or the
        years.
      </p>
    );
  }
  return (
    <p className="csv-status">
      <strong>{formatCount(rows)}</strong> hotspots in {formatCount(cells)} cells.
    </p>
  );
}
