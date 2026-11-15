import { composeExportSvg, type ExportMeta } from "./exportFile";

/** Styles that decide how an SVG element looks. Copied from the computed style, so the file needs no stylesheet. */
const STYLE_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "display",
  "visibility",
] as const;

const SKIP_TAGS = new Set(["title", "desc"]);

/** Inlines every drawing style of the rendered SVG into its clone (CSS variables and `currentColor` resolved). */
function inlineStyles(live: Element, copy: Element): void {
  if (!SKIP_TAGS.has(live.tagName.toLowerCase())) {
    const computed = getComputedStyle(live);
    copy.setAttribute("style", STYLE_PROPERTIES.map((name) => `${name}:${computed.getPropertyValue(name)}`).join(";"));
  }
  for (const attr of ["class", "tabindex", "role", "aria-label", "aria-pressed", "data-cell"]) copy.removeAttribute(attr);
  const copyChildren = Array.from(copy.children);
  Array.from(live.children).forEach((child, index) => {
    if (copyChildren[index]) inlineStyles(child, copyChildren[index]);
  });
}

/** The first opaque background behind an element: the card, or the calendar's light island. */
function backgroundBehind(element: Element): string {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return color;
  }
  return "#ffffff";
}

export type ExportedImage = { svg: string; width: number; height: number };

/** The chart on screen as a standalone SVG with title, unit, area, period, source and model version as text. */
export function buildExportImage(live: SVGSVGElement, meta: ExportMeta): ExportedImage {
  const box = live.getBoundingClientRect();
  const viewBox = live.viewBox.baseVal;
  const chartWidth = viewBox && viewBox.width > 0 ? viewBox.width : box.width;
  const chartHeight = viewBox && viewBox.height > 0 ? viewBox.height : box.height;
  const copy = live.cloneNode(true) as SVGSVGElement;
  inlineStyles(live, copy);
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(chartWidth));
  copy.setAttribute("height", String(chartHeight));
  if (!copy.getAttribute("viewBox")) copy.setAttribute("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
  const theme = getComputedStyle(live);
  return composeExportSvg({
    chartMarkup: new XMLSerializer().serializeToString(copy),
    chartWidth,
    chartHeight,
    meta,
    colors: {
      background: backgroundBehind(live),
      text: theme.getPropertyValue("--color-text-primary").trim() || theme.color,
      secondary: theme.getPropertyValue("--color-text-secondary").trim() || theme.color,
    },
    fontFamily: theme.fontFamily,
  });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rasterizes the standalone SVG at twice its size (sharp on screens with a high pixel density). */
export async function svgToPngBlob(image: ExportedImage, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([image.svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const bitmap = new Image();
    await new Promise<void>((resolve, reject) => {
      bitmap.onload = () => resolve();
      bitmap.onerror = () => reject(new Error("The image could not be drawn."));
      bitmap.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser cannot draw the image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The PNG could not be made."))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
