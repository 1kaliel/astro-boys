/* Small line icons for toolbars, drawn in the text color (one stroke, one size). */
const PATHS = {
  download: "M8 2.5v7.5M4.75 7 8 10.25 11.25 7M3 13h10",
  edit: "M10.5 2.75l2.75 2.75L6 12.75H3.25V10L10.5 2.75Z",
  draw: "M2.75 2.75h4M2.75 2.75v4M13.25 13.25h-4M13.25 13.25v-4M9.25 2.75h4v4M6.75 13.25h-4v-4",
  frame: "M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3",
  calendar: "M2.75 3.75h10.5v9.5H2.75zM2.75 6.75h10.5M5.5 2v3M10.5 2v3",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ?? "ui-icon"} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
