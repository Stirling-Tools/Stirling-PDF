import type { StirlingFileStub } from "@app/types/fileContext";
import type { ToolFormatExtension } from "@app/types/toolIO";
import { convertImageToPdf } from "@app/utils/imageToPdfUtils";
import {
  detectFileExtension,
  isPdfFile,
  splitFileName,
} from "@app/utils/fileUtils";

type FileLike = Pick<StirlingFileStub, "name" | "type">;

/**
 * The IMAGE formats the browser can decode, so a one-page track can draw and
 * embed them without the backend.
 */
const BROWSER_DECODABLE_EXTENSIONS: ReadonlySet<string> = new Set<
  ToolFormatExtension<"IMAGE">
>(["png", "jpg", "gif", "bmp", "webp"]);

/** An image the page editor shows as a track holding one page: the image. */
export const isPageImage = (file: FileLike): boolean =>
  BROWSER_DECODABLE_EXTENSIONS.has(detectFileExtension(file.name));

export const opensAsTrack = (file: FileLike): boolean =>
  isPdfFile(file) || isPageImage(file);

/** Everything a track is saved as is a PDF, whatever the file was before. */
export const toPdfName = (name: string): string =>
  `${splitFileName(name)[0]}.pdf`;

/**
 * The file as a PDF the export service can copy pages from. An image becomes a
 * single page the size of its pixels at 72 dpi, so it keeps its own aspect and
 * resolution rather than being fitted to a paper size.
 */
export async function asPdfSource(file: File): Promise<File> {
  return isPageImage(file)
    ? convertImageToPdf(file, { pageFormat: "keep" })
    : file;
}
