import {
  openRawDocumentSafe,
  closeRawDocument,
  PdfiumOpenError,
  FPDF_ERR_PASSWORD,
} from "@editor/services/pdfiumService";
import { renderPdfiumFirstPage } from "@editor/utils/pdfiumPageRender";
import type { FirstPageRender } from "@editor/utils/pdfiumRenderCore";
import {
  canRenderInWorker,
  renderFirstPageInWorker,
  RenderWorkerUnavailable,
} from "@editor/services/pdfRenderWorkerClient";
import { jpegExifOrientation } from "@editor/utils/jpegOrientation";
import { getDocumentBytes } from "@editor/services/documentBytesCache";
import { readBlobSlice } from "@editor/utils/blobSlice";
import { getPdfAccess } from "@editor/services/pdfAccessService";
import { looksEncryptedFromTrailer } from "@editor/utils/pdfEncryptionProbe";
import { isDamagedPdfError } from "@editor/utils/pdfDamage";
import { LARGE_PDF_PARSE_LIMIT } from "@editor/utils/pdfParseLimit";

export interface ThumbnailWithMetadata {
  thumbnail: string; // Always returns a thumbnail (placeholder if needed)
  pageCount: number;
  pageRotations?: number[]; // Rotation for each page (0, 90, 180, 270)
  pageDimensions?: Array<{ width: number; height: number }>;
  isEncrypted?: boolean;
  /** PDFium could not parse the whole file; never set from a large-file prefix. */
  isDamaged?: boolean;
}

/**
 * Calculate thumbnail scale based on file size (modern 2024 scaling)
 */
export function calculateScaleFromFileSize(fileSize: number): number {
  const MB = 1024 * 1024;
  if (fileSize < 10 * MB) return 1.0; // Full quality for small files
  if (fileSize < 50 * MB) return 0.8; // High quality for common file sizes
  if (fileSize < 200 * MB) return 0.6; // Good quality for typical large files
  if (fileSize < 500 * MB) return 0.4; // Readable quality for large but manageable files
  return 0.3; // Still usable quality, not tiny
}

/** Callers still get a placeholder, but log the cause: an empty thumbnail is
 *  indistinguishable from "no raster preview", so an outage hides as a nicety. */
function reportThumbnailFailure(file: File, error: unknown): void {
  console.warn(`Thumbnail generation failed for ${file.name}:`, error);
}

export { LARGE_PDF_PARSE_LIMIT };

/** Linearized PDFs keep page 1 + hint tables in the first bytes, so a small
 * prefix is often enough to render a thumbnail without reading the file. */
const LINEARIZED_PREFIX_BYTES = 2 * 1024 * 1024;

/** Longest side of an image thumbnail, in pixels (aspect preserved); the
 * hover preview renders at 150 CSS px, so this covers 2x displays. */
const IMAGE_THUMBNAIL_MAX_SIZE = 320;

/** Bytes read from the head of an image to locate its intrinsic size. */
const IMAGE_HEADER_PROBE_BYTES = 256 * 1024;

/** Extra bytes read when a JPEG's start-of-frame marker sits behind a large
 *  metadata segment; the first probe covers the common case. */
const IMAGE_HEADER_PROBE_LIMIT = 4 * 1024 * 1024;

interface PdfiumRenderResult {
  thumbnail: string;
  pageCount: number;
  pageRotations: number[];
  pageDimensions: Array<{ width: number; height: number }>;
  /** Set when the document is password-protected — caller substitutes the
   * encrypted placeholder. Thumbnail/metadata fields are empty in that case. */
  isEncrypted?: boolean;
}

const ENCRYPTED: PdfiumRenderResult = {
  thumbnail: "",
  pageCount: 1,
  pageRotations: [],
  pageDimensions: [],
  isEncrypted: true,
};

/**
 * Page 1 in each requested rotation mode (upright for CSS rotation, or with the
 * page's rotation baked in) plus page metadata, from one document open. Runs in
 * the render worker where available, on the main thread otherwise.
 *
 * @param allPagesMetadata When true, reads per-page rotation and dimensions for
 *   all pages. When false (a large file's prefix), only page 1's.
 */
async function renderPdfThumbnails(
  source: Blob,
  scale: number,
  modes: Array<"unrotated" | "rotated">,
  allPagesMetadata: boolean,
  password?: string,
  /** Receives how many bytes PDFium was actually given. */
  read?: { bytes: number },
): Promise<Partial<Record<"unrotated" | "rotated", PdfiumRenderResult>>> {
  let render: FirstPageRender | null = null;
  try {
    if (canRenderInWorker()) {
      if (read) read.bytes = source.size;
      try {
        render = await renderFirstPageInWorker(
          source,
          password ?? "",
          scale,
          {},
          modes,
          allPagesMetadata,
        );
      } catch (error) {
        if (!(error instanceof RenderWorkerUnavailable)) throw error;
      }
    }
    if (!render) {
      const bytes = await getDocumentBytes(source);
      if (read) read.bytes = bytes.byteLength;
      const docPtr = await openRawDocumentSafe(bytes, password);
      try {
        render = await renderPdfiumFirstPage(
          docPtr,
          scale,
          {},
          modes,
          allPagesMetadata,
        );
      } finally {
        await closeRawDocument(docPtr);
      }
    }
  } catch (error) {
    const bytesRead = (error as { bytesRead?: number } | null)?.bytesRead;
    if (read && bytesRead !== undefined) read.bytes = bytesRead;
    if (error instanceof PdfiumOpenError && error.code === FPDF_ERR_PASSWORD) {
      return Object.fromEntries(modes.map((mode) => [mode, { ...ENCRYPTED }]));
    }
    throw error;
  }
  const { pageCount, pageRotations, pageDimensions } = render;
  return Object.fromEntries(
    modes.map((mode) => [
      mode,
      {
        thumbnail: render.thumbnails[mode] ?? "",
        pageCount,
        pageRotations,
        pageDimensions,
      },
    ]),
  );
}

/** The first `bytes` of `file` as an in-memory Blob, since a Blob built over a stored one kills the renderer. */
async function prefixBlob(file: Blob, bytes: number): Promise<Blob> {
  return new Blob([await readBlobSlice(file, 0, bytes)], { type: file.type });
}

async function renderPdfThumbnail(
  source: Blob,
  scale: number,
  applyRotation: boolean,
  allPagesMetadata: boolean,
  password?: string,
): Promise<PdfiumRenderResult> {
  const mode = applyRotation ? "rotated" : "unrotated";
  const result = await renderPdfThumbnails(
    source,
    scale,
    [mode],
    allPagesMetadata,
    password,
  );
  return result[mode]!;
}

async function generatePDFThumbnail(
  source: Blob,
  scale: number,
  password?: string,
): Promise<string> {
  const result = await renderPdfThumbnail(source, scale, true, false, password);
  if (result.isEncrypted) {
    return "";
  }
  return result.thumbnail;
}

/**
 * Read intrinsic pixel dimensions from an image header without decoding it.
 * Returns null for formats the probe does not recognise, so the caller keeps
 * the width-only resize request instead of failing.
 */
async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  let bytes: Uint8Array;
  try {
    bytes = await readBlobSlice(file, 0, IMAGE_HEADER_PROBE_BYTES);
  } catch {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // PNG: IHDR is the first chunk; big-endian width/height at offsets 16/20.
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // GIF: logical screen descriptor; little-endian width/height at offsets 6/8.
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  // BMP: BITMAPINFOHEADER; signed little-endian at 18/22, negative = top-down.
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return {
      width: Math.abs(view.getInt32(18, true)),
      height: Math.abs(view.getInt32(22, true)),
    };
  }

  // WebP: RIFF container, the chunk id at offset 12 identifies the encoding.
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const chunk = String.fromCharCode(
      bytes[12],
      bytes[13],
      bytes[14],
      bytes[15],
    );
    if (chunk === "VP8X") {
      return {
        width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
        height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
      };
    }
    if (chunk === "VP8 ") {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    return null;
  }

  // JPEG: walk the segment list until a start-of-frame marker carries the size.
  // A large EXIF/ICC segment can push that marker past the first probe, so the
  // window doubles until it is found or the cap is reached.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const limit = Math.min(file.size, IMAGE_HEADER_PROBE_LIMIT);
    for (let end = bytes.length; ; end = Math.min(end * 2, limit)) {
      const window =
        end === bytes.length ? bytes : await readBlobSlice(file, 0, end);
      const dimensions = readJpegDimensions(
        window,
        new DataView(window.buffer, window.byteOffset, window.byteLength),
      );
      if (dimensions) {
        // EXIF orientations 5-8 rotate the image, so the bitmap
        // createImageBitmap produces has the header's axes swapped.
        const orientation = jpegExifOrientation(window);
        return orientation >= 5 && orientation <= 8
          ? { width: dimensions.height, height: dimensions.width }
          : dimensions;
      }
      if (end >= limit) return null;
    }
  }

  return null;
}

/** Walk JPEG segments to the start-of-frame marker that carries the size. */
function readJpegDimensions(
  bytes: Uint8Array,
  view: DataView,
): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Standalone markers have no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) return null;
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isStartOfFrame) {
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

/** Resize a known source to fit a `maxSize` box, longest side first, never
 *  enlarging it. */
function thumbnailResizeOptions(
  source: { width: number; height: number },
  maxSize: number,
): {
  resizeWidth: number;
  resizeHeight: number;
} {
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  return {
    resizeWidth: Math.max(1, Math.round(source.width * scale)),
    resizeHeight: Math.max(1, Math.round(source.height * scale)),
  };
}

function paintThumbnail(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** JPEG-encode a bitmap. OffscreenCanvas keeps the encode off the main thread
 *  where the engine supports it; jsdom and older WebKit fall back to a DOM
 *  canvas. */
async function encodeThumbnailJpeg(bitmap: ImageBitmap): Promise<string> {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    paintThumbnail(ctx, bitmap);
    // JPEG on purpose: the data URL is the thumbnail contract every consumer
    // and the DOM fallback below share, so the engine must not pick another
    // format here.
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.8,
    });
    return blobToDataUrl(blob);
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  paintThumbnail(ctx, bitmap);
  return canvas.toDataURL("image/jpeg", 0.8);
}

/**
 * A JPEG data URL of the image with its longest side at most `maxSize` pixels,
 * decoded at that size rather than at full resolution. Throws when the header
 * gives no dimensions or the browser cannot decode the image.
 */
export async function generateImageThumbnail(
  file: File,
  maxSize: number,
): Promise<string> {
  const source = await readImageDimensions(file);
  // Without a header ratio a width-only request would let an extreme portrait
  // ask for a maxSize x tens-of-millions bitmap.
  if (!source) throw new Error("image dimensions unavailable");
  const bitmap = await createImageBitmap(file, {
    ...thumbnailResizeOptions(source, maxSize),
    resizeQuality: "high",
    imageOrientation: "from-image",
  });
  try {
    return await encodeThumbnailJpeg(bitmap);
  } finally {
    bitmap.close();
  }
}

/**
 * Generate thumbnail for any file type - always returns a thumbnail (placeholder if needed)
 */
export async function generateThumbnailForFile(file: File): Promise<string> {
  // Very large PDFs skip thumbnail generation — SVG icon shown in UI instead
  if (file.size >= LARGE_PDF_PARSE_LIMIT) {
    return "";
  }

  // Handle image files - decode once at tooltip size instead of full-res.
  // A phone photo decodes to ~48 MB RGBA plus an ~11 MB data URL string that
  // then lives in IndexedDB; the 320px JPEG below is ~30 KB and identical in
  // the 150px hover preview. Anything createImageBitmap cannot handle (SVG
  // without intrinsic size, exotic codecs) falls back to the data URL.
  if (file.type.startsWith("image/")) {
    try {
      return await generateImageThumbnail(file, IMAGE_THUMBNAIL_MAX_SIZE);
    } catch {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }
  }

  // Handle PDF files
  if (file.type.startsWith("application/pdf")) {
    const scale = calculateScaleFromFileSize(file.size);

    // Only read first 2MB for thumbnail generation to save memory
    const chunk = await prefixBlob(file, LINEARIZED_PREFIX_BYTES);

    try {
      return await generatePDFThumbnail(
        chunk,
        scale,
        getPdfAccess(file)?.password,
      );
    } catch {
      // PDFium needs the xref table at the end of the file, so the 2MB
      // chunk can fail to open for PDFs larger than that. Retry with the
      // full buffer before falling back to an empty thumbnail.
      try {
        return await generatePDFThumbnail(
          file,
          scale,
          getPdfAccess(file)?.password,
        );
      } catch (error) {
        reportThumbnailFailure(file, error);
        return "";
      }
    }
  }

  // Non-PDF, non-image files use scalable SVG icons in the UI — no raster thumbnail needed
  return "";
}

/**
 * Generate thumbnail and extract page count for a PDF file - always returns a valid thumbnail
 * @param applyRotation - If true, render thumbnail with PDF rotation applied (for static display).
 *                        If false, render without rotation (for CSS-based rotation in PageEditor)
 */
export async function generateThumbnailWithMetadata(
  file: File,
  applyRotation: boolean = true,
): Promise<ThumbnailWithMetadata> {
  // Non-PDF files have no page count
  if (!file.type.startsWith("application/pdf")) {
    const thumbnail = await generateThumbnailForFile(file);
    return { thumbnail, pageCount: 0 };
  }

  const scale = calculateScaleFromFileSize(file.size);

  // Never full-parse huge PDFs client-side - the renderer process OOMs long
  // before system RAM runs out. The prefix succeeds for linearized PDFs.
  if (file.size >= LARGE_PDF_PARSE_LIMIT) {
    // Probe inside the try: an unreadable file must still resolve, or the
    // caller leaves the card with no metadata and a spinner that never stops.
    try {
      if (!getPdfAccess(file) && (await looksEncryptedFromTrailer(file))) {
        return { thumbnail: "", pageCount: 1, isEncrypted: true };
      }
      const result = await renderPdfThumbnail(
        await prefixBlob(file, LINEARIZED_PREFIX_BYTES),
        scale,
        applyRotation,
        false,
        getPdfAccess(file)?.password,
      );
      if (result.isEncrypted) {
        return { thumbnail: "", pageCount: 1, isEncrypted: true };
      }
      return {
        thumbnail: result.thumbnail,
        pageCount: result.pageCount,
        pageRotations: result.pageRotations,
        pageDimensions: result.pageDimensions,
      };
    } catch (error) {
      reportThumbnailFailure(file, error);
      return { thumbnail: "", pageCount: 0 };
    }
  }

  try {
    // Always read per-page rotation: PageEditor renders thumbnails upright and
    // uses this as the rotation baseline, so skipping it corrupts saves.
    const result = await renderPdfThumbnail(
      file,
      scale,
      applyRotation,
      true,
      getPdfAccess(file)?.password,
    );

    if (result.isEncrypted) {
      return {
        thumbnail: "",
        pageCount: 1,
        isEncrypted: true,
      };
    }

    return {
      thumbnail: result.thumbnail,
      pageCount: result.pageCount,
      pageRotations: result.pageRotations,
      pageDimensions: result.pageDimensions,
    };
  } catch (error) {
    reportThumbnailFailure(file, error);
    return { thumbnail: "", pageCount: 1 };
  }
}

/**
 * Both thumbnail variants + page metadata from ONE full parse instead of two.
 * Large PDFs only get the linearized-prefix attempt; if that fails, both
 * variants are empty placeholders and page metadata is omitted.
 */
export async function generateThumbnailPairWithMetadata(file: File): Promise<{
  unrotated: ThumbnailWithMetadata;
  rotated: ThumbnailWithMetadata;
}> {
  const scale = calculateScaleFromFileSize(file.size);
  const isLarge = file.size >= LARGE_PDF_PARSE_LIMIT;
  let parsedBytes = 0;
  try {
    // Probe inside the try: an unreadable file must still resolve, or the
    // caller leaves the card with no metadata and a spinner that never stops.
    if (
      isLarge &&
      !getPdfAccess(file) &&
      (await looksEncryptedFromTrailer(file))
    ) {
      const encrypted: ThumbnailWithMetadata = {
        thumbnail: "",
        pageCount: 1,
        isEncrypted: true,
      };
      return { unrotated: encrypted, rotated: { ...encrypted } };
    }
    const source = isLarge
      ? await prefixBlob(file, LINEARIZED_PREFIX_BYTES)
      : file;
    const read = { bytes: 0 };
    let pair: Awaited<ReturnType<typeof renderPdfThumbnails>>;
    try {
      pair = await renderPdfThumbnails(
        source,
        scale,
        ["unrotated", "rotated"],
        !isLarge,
        getPdfAccess(file)?.password,
        read,
      );
    } finally {
      parsedBytes = read.bytes;
    }

    const toPublic = (r: PdfiumRenderResult): ThumbnailWithMetadata =>
      r.isEncrypted
        ? { thumbnail: "", pageCount: 1, isEncrypted: true }
        : {
            thumbnail: r.thumbnail,
            pageCount: r.pageCount,
            pageRotations: r.pageRotations,
            pageDimensions: r.pageDimensions,
          };
    return {
      unrotated: toPublic(pair.unrotated!),
      rotated: toPublic(pair.rotated!),
    };
  } catch (error) {
    reportThumbnailFailure(file, error);
    // Damage needs PDFium to have rejected the whole file: a prefix (large files) or a short read
    // fails on bytes that are not the file. Unsupported encryption can also read as a format error.
    const isDamaged =
      !isLarge &&
      parsedBytes === file.size &&
      isDamagedPdfError(error) &&
      !(await looksEncryptedFromTrailer(file).catch(() => true));
    return {
      unrotated: { thumbnail: "", pageCount: 0, isDamaged },
      rotated: { thumbnail: "", pageCount: 0, isDamaged },
    };
  }
}
