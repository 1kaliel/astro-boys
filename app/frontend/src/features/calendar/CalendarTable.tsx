import { formatCount } from "../../lib/format";
import type { CalendarSerie } from "./calendarModel";

/** The same numbers as the chart, as a table: exact values, keyboard and screen-reader friendly. */
export function CalendarTable({ series, unit }: { series: ReadonlyArray<CalendarSerie>; unit: string }) {
  return (
    <div className="calendar-table-wrap" role="region" aria-label="Burning calendar, table view" tabIndex={0}>
      <table className="calendar-table">
        <caption className="calendar-table-caption">{unit}, by year and month</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            {(series[0]?.data ?? []).map((cell) => (
              <th key={cell.month} scope="col">
                {cell.x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.id}</th>
              {row.data.map((cell) => (
                <td key={cell.month}>
                  {cell.entry && cell.y === null ? "No estimate" : formatCount(cell.y)}
                  {cell.entry?.isEstimated ? " est." : ""}
                  {cell.entry?.isPartial ? " partial" : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="calendar-table-note">
        est. = estimated from MODIS, partial = month not complete, No data = no row (not zero).
      </p>
    </div>
  );
}
