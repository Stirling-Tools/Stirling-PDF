import { convertImageToPdf } from "@app/utils/imageToPdfUtils";

/**
 * Image formats the browser can decode, so a one-page track can draw and embed
 * them without the backend. TIFF is left out: only Safari decodes it.
 */
const PAGE_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
]);

const extensionOf = (name: string | undefined): string => {
  const dot = name?.lastIndexOf(".") ?? -1;
  return dot > 0 && name ? name.slice(dot + 1).toLowerCase() : "";
};

export const isPdfName = (name: string | undefined): boolean =>
  extensionOf(name) === "pdf";

/** An image the page editor shows as a track holding one page: the image. */
export const isPageImageName = (name: string | undefined): boolean =>
  PAGE_IMAGE_EXTENSIONS.has(extensionOf(name));

export const opensAsTrack = (name: string | undefined): boolean =>
  isPdfName(name) || isPageImageName(name);

/** Everything a track is saved as is a PDF, whatever the file was before. */
export function toPdfName(name: string): string {
  if (isPdfName(name)) return name;
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.pdf`;
}

/**
 * The file as a PDF the export service can copy pages from. An image becomes a
 * single page the size of its pixels at 72 dpi, so it keeps its own aspect and
 * resolution rather than being fitted to a paper size.
 */
export async function asPdfSource(file: File): Promise<File> {
  return isPageImageName(file.name)
    ? convertImageToPdf(file, { pageFormat: "keep" })
    : file;
}
