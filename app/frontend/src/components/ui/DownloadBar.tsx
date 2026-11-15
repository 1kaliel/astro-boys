import { useRef, useState } from "react";
import { buildExportImage, downloadBlob, svgToPngBlob } from "../../lib/chartExport";
import type { ExportMeta } from "../../lib/exportFile";
import { Button } from "./Button";

type ImageDownloadProps = {
  /** What the file says about itself (title, unit, area, period, source, model version). */
  meta: ExportMeta;
  /** Builds the file name for an extension, e.g. `(ext) => "astro-boys-trend.svg"`. */
  fileName: (ext: "svg" | "png") => string;
  /** Finds the chart's `<svg>` inside the parent of the bar. */
  svgSelector: string;
  /** Finds the chart's `<svg>` when the bar is not next to it (e.g. inside an Export menu, which is portaled). */
  findSvg?: () => SVGSVGElement | null;
};

/**
 * "Image: SVG, PNG" for the chart next to it. The file is built in the browser from the SVG on screen, with the
 * styles inlined and the title, unit, area, period, source and model version written as text.
 */
export function ImageDownload({ meta, fileName, svgSelector, findSvg }: ImageDownloadProps) {
  const bar = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (ext: "svg" | "png") => {
    setError(null);
    const svg = findSvg ? findSvg() : bar.current?.parentElement?.querySelector<SVGSVGElement>(svgSelector);
    if (!svg) {
      setError("The chart is not on screen.");
      return;
    }
    try {
      const image = buildExportImage(svg, meta);
      const blob =
        ext === "svg" ? new Blob([image.svg], { type: "image/svg+xml;charset=utf-8" }) : await svgToPngBlob(image);
      downloadBlob(blob, fileName(ext));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The image could not be made.");
    }
  };

  return (
    <div className="download-bar" ref={bar} role="group" aria-label={`Download ${meta.title} as an image`}>
      <span className="download-label">Image</span>
      <Button onClick={() => run("svg")} aria-label={`Download ${meta.title} as SVG`}>
        SVG
      </Button>
      <Button onClick={() => run("png")} aria-label={`Download ${meta.title} as PNG`}>
        PNG
      </Button>
      {error && (
        <span className="download-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

type TextDownloadProps = {
  label: string;
  /** Builds the file text when the button is pressed (from the data already in memory). */
  build: () => string;
  fileName: string;
  mime: string;
};

/** One button that downloads a text file built on demand, e.g. the calendar table as CSV. */
export function TextDownload({ label, build, fileName, mime }: TextDownloadProps) {
  return (
    <Button onClick={() => downloadBlob(new Blob([build()], { type: `${mime};charset=utf-8` }), fileName)}>{label}</Button>
  );
}
