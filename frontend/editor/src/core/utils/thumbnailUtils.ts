import {
  openRawDocumentSafe,
  closeRawDocument,
  getPdfiumModule,
  PdfiumOpenError,
  FPDF_ERR_PASSWORD,
} from "@app/services/pdfiumService";
import {
  renderPdfiumPageDataUrl,
  readPdfiumPageMetadata,
} from "@app/utils/pdfiumPageRender";
import { jpegExifOrientation } from "@app/utils/jpegOrientation";
import { lossyEncodeOptions } from "@app/utils/canvasImageEncoding";

export interface ThumbnailWithMetadata {
  thumbnail: string; // Always returns a thumbnail (placeholder if needed)
  pageCount: number;
  pageRotations?: number[]; // Rotation for each page (0, 90, 180, 270)
  pageDimensions?: Array<{ width: number; height: number }>;
  isEncrypted?: boolean;
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

/** PDFs at or above this size never get a full-buffer client-side parse
 * (renderer OOM) - only the linearized-prefix attempt below. */
export const LARGE_PDF_PARSE_LIMIT = 100 * 1024 * 1024;

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

/** Window at each end of the file searched for an /Encrypt entry. */
const ENCRYPT_PROBE_BYTES = 64 * 1024;

/** Decoded latin1 because the input is binary - UTF-8 replacement characters
 * can swallow the marker. \b excludes longer keys like /Encryption. */
export function containsEncryptMarker(bytes: Uint8Array): boolean {
  return /\/Encrypt\b/.test(new TextDecoder("latin1").decode(bytes));
}

/** /Encrypt is referenced from a trailer, never from the page data the prefix
 * parse sees. Linearized PDFs (most large ones) keep their first-page trailer at
 * the head and the main one at the tail, so both windows have to be probed.
 * Heuristic: a false positive offers unlock on a file that did not need it, a
 * false negative leaves it unopenable. */
async function looksEncryptedFromTrailer(file: File): Promise<boolean> {
  const tailStart = Math.max(0, file.size - ENCRYPT_PROBE_BYTES);
  const tail = await file.slice(tailStart).arrayBuffer();
  if (containsEncryptMarker(new Uint8Array(tail))) return true;
  if (tailStart === 0) return false;
  const head = await file.slice(0, ENCRYPT_PROBE_BYTES).arrayBuffer();
  return containsEncryptMarker(new Uint8Array(head));
}

interface PdfiumRenderResult {
  thumbnail: string;
  pageCount: number;
  pageRotations: number[];
  pageDimensions: Array<{ width: number; height: number }>;
  /** Set when the document is password-protected — caller substitutes the
   * encrypted placeholder. Thumbnail/metadata fields are empty in that case. */
  isEncrypted?: boolean;
}

/**
 * Open a PDF with PDFium, render page 1 to a data URL, and optionally
 * collect rotation + dimensions for every page. Returns `isEncrypted: true`
 * (without rendering) when the document is password-protected.
 *
 * @param applyRotation When true, bakes the page's own rotation into the
 *   bitmap (static display). When false, renders upright so callers can
 *   apply rotation via CSS (PageEditor).
 * @param collectAllPagesMetadata When true, reads per-page rotation and
 *   dimensions for all pages. When false (very large files), only the
 *   first page's metadata is populated.
 */
async function renderPdfThumbnailPdfium(
  data: ArrayBuffer,
  scale: number,
  applyRotation: boolean,
  collectAllPagesMetadata: boolean,
): Promise<PdfiumRenderResult> {
  const m = await getPdfiumModule();
  let docPtr: number;
  try {
    docPtr = await openRawDocumentSafe(data);
  } catch (error) {
    if (error instanceof PdfiumOpenError && error.code === FPDF_ERR_PASSWORD) {
      return {
        thumbnail: "",
        pageCount: 1,
        pageRotations: [],
        pageDimensions: [],
        isEncrypted: true,
      };
    }
    throw error;
  }

  try {
    const pageCount = m.FPDF_GetPageCount(docPtr);
    const thumbnail = await renderPdfiumPageDataUrl(docPtr, 0, scale, {
      applyRotation,
    });
    if (!thumbnail) throw new Error("PDFium: failed to render page 0");

    // Page 0 metadata is already available via the render, but read it
    // directly for consistency with the later per-page loop.
    const firstMeta = await readPdfiumPageMetadata(docPtr, 0);
    const pageRotations: number[] = [firstMeta?.rotation ?? 0];
    const pageDimensions: Array<{ width: number; height: number }> = [
      {
        width: firstMeta?.width ?? 0,
        height: firstMeta?.height ?? 0,
      },
    ];

    if (collectAllPagesMetadata) {
      for (let i = 1; i < pageCount; i++) {
        const meta = await readPdfiumPageMetadata(docPtr, i);
        if (!meta) continue;
        pageRotations[i] = meta.rotation;
        pageDimensions[i] = { width: meta.width, height: meta.height };
      }
    }

    return { thumbnail, pageCount, pageRotations, pageDimensions };
  } finally {
    await closeRawDocument(docPtr);
  }
}

/**
 * Render both thumbnail variants (upright + rotation-baked) from a single
 * document open - halves the parse and memory cost of the add-files path.
 */
async function renderPdfThumbnailPairPdfium(
  data: ArrayBuffer,
  scale: number,
  collectAllPagesMetadata: boolean,
): Promise<{ unrotated: PdfiumRenderResult; rotated: PdfiumRenderResult }> {
  const m = await getPdfiumModule();
  let docPtr: number;
  try {
    docPtr = await openRawDocumentSafe(data);
  } catch (error) {
    if (error instanceof PdfiumOpenError && error.code === FPDF_ERR_PASSWORD) {
      const encrypted: PdfiumRenderResult = {
        thumbnail: "",
        pageCount: 1,
        pageRotations: [],
        pageDimensions: [],
        isEncrypted: true,
      };
      return { unrotated: encrypted, rotated: { ...encrypted } };
    }
    throw error;
  }

  try {
    const pageCount = m.FPDF_GetPageCount(docPtr);
    const unrotatedThumb = await renderPdfiumPageDataUrl(docPtr, 0, scale, {
      applyRotation: false,
    });
    const rotatedThumb = await renderPdfiumPageDataUrl(docPtr, 0, scale, {
      applyRotation: true,
    });
    if (!unrotatedThumb || !rotatedThumb) {
      throw new Error("PDFium: failed to render page 0");
    }

    const firstMeta = await readPdfiumPageMetadata(docPtr, 0);
    const pageRotations: number[] = [firstMeta?.rotation ?? 0];
    const pageDimensions: Array<{ width: number; height: number }> = [
      { width: firstMeta?.width ?? 0, height: firstMeta?.height ?? 0 },
    ];
    if (collectAllPagesMetadata) {
      for (let i = 1; i < pageCount; i++) {
        const meta = await readPdfiumPageMetadata(docPtr, i);
        if (!meta) continue;
        pageRotations[i] = meta.rotation;
        pageDimensions[i] = { width: meta.width, height: meta.height };
      }
    }

    const base = { pageCount, pageRotations, pageDimensions };
    return {
      unrotated: { thumbnail: unrotatedThumb, ...base },
      rotated: { thumbnail: rotatedThumb, ...base },
    };
  } finally {
    await closeRawDocument(docPtr);
  }
}

async function generatePDFThumbnail(
  arrayBuffer: ArrayBuffer,
  scale: number,
): Promise<string> {
  const result = await renderPdfThumbnailPdfium(
    arrayBuffer,
    scale,
    true,
    false,
  );
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
    bytes = new Uint8Array(
      await file.slice(0, IMAGE_HEADER_PROBE_BYTES).arrayBuffer(),
    );
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
        end === bytes.length
          ? bytes
          : new Uint8Array(await file.slice(0, end).arrayBuffer());
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

/** Resize a known source into a thumbnail-sized box, longest side first. */
function thumbnailResizeOptions(source: { width: number; height: number }): {
  resizeWidth: number;
  resizeHeight: number;
} {
  const scale =
    IMAGE_THUMBNAIL_MAX_SIZE / Math.max(source.width, source.height);
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
    // The probe keeps WebKit's silent PNG serialisation of an unencodable type
    // from inflating the thumbnail.
    const blob = await canvas.convertToBlob(await lossyEncodeOptions(0.8));
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
      const source = await readImageDimensions(file);
      // Without a header ratio a width-only request would let an extreme
      // portrait ask for a 320 x tens-of-millions bitmap, so unknown sizes take
      // the data URL path below instead of decoding.
      if (!source) throw new Error("image dimensions unavailable");
      const bitmap = await createImageBitmap(file, {
        ...thumbnailResizeOptions(source),
        resizeQuality: "high",
        imageOrientation: "from-image",
      });
      try {
        return await encodeThumbnailJpeg(bitmap);
      } finally {
        bitmap.close();
      }
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
    const chunk = file.slice(0, Math.min(LINEARIZED_PREFIX_BYTES, file.size));
    const arrayBuffer = await chunk.arrayBuffer();

    try {
      return await generatePDFThumbnail(arrayBuffer, scale);
    } catch {
      // PDFium needs the xref table at the end of the file, so the 2MB
      // chunk can fail to open for PDFs larger than that. Retry with the
      // full buffer before falling back to an empty thumbnail.
      try {
        const fullArrayBuffer = await file.arrayBuffer();
        return await generatePDFThumbnail(fullArrayBuffer, scale);
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
      if (await looksEncryptedFromTrailer(file)) {
        return { thumbnail: "", pageCount: 1, isEncrypted: true };
      }
      const chunk = await file.slice(0, LINEARIZED_PREFIX_BYTES).arrayBuffer();
      const result = await renderPdfThumbnailPdfium(
        chunk,
        scale,
        applyRotation,
        false,
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
    const arrayBuffer = await file.arrayBuffer();
    // Always read per-page rotation: PageEditor renders thumbnails upright and
    // uses this as the rotation baseline, so skipping it corrupts saves.
    const result = await renderPdfThumbnailPdfium(
      arrayBuffer,
      scale,
      applyRotation,
      true,
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
  try {
    // Probe inside the try: an unreadable file must still resolve, or the
    // caller leaves the card with no metadata and a spinner that never stops.
    if (isLarge && (await looksEncryptedFromTrailer(file))) {
      const encrypted: ThumbnailWithMetadata = {
        thumbnail: "",
        pageCount: 1,
        isEncrypted: true,
      };
      return { unrotated: encrypted, rotated: { ...encrypted } };
    }
    const buffer = isLarge
      ? await file.slice(0, LINEARIZED_PREFIX_BYTES).arrayBuffer()
      : await file.arrayBuffer();
    const pair = await renderPdfThumbnailPairPdfium(buffer, scale, !isLarge);

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
      unrotated: toPublic(pair.unrotated),
      rotated: toPublic(pair.rotated),
    };
  } catch (error) {
    reportThumbnailFailure(file, error);
    return {
      unrotated: { thumbnail: "", pageCount: 0 },
      rotated: { thumbnail: "", pageCount: 0 },
    };
  }
}
