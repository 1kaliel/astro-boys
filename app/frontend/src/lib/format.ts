const countFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, signDisplay: "always" });
const signedFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, signDisplay: "always" });

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** A hotspot count for display. Null means "no data", never zero. */
export function formatCount(value: number | null | undefined): string {
  return value == null ? "No data" : countFormat.format(value);
}

export function formatSigned(value: number): string {
  return signedFormat.format(value);
}

/** Percent change, or null when the baseline is zero (undefined percentage). */
export function formatPercent(value: number | null | undefined): string | null {
  return value == null ? null : `${percentFormat.format(value)}%`;
}
