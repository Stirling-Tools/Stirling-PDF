import {
  openRawDocumentSafe,
  closeRawDocument,
  getPdfiumModule,
} from "@app/services/pdfiumService";
import {
  renderPdfiumPageDataUrl,
  readPdfiumPageMetadata,
} from "@app/utils/pdfiumPageRender";

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

/** PDFium error code 4 = password required (encrypted PDF). */
const PDFIUM_ERR_PASSWORD = 4;

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
    if (
      error instanceof Error &&
      new RegExp(`error ${PDFIUM_ERR_PASSWORD}`).test(error.message)
    ) {
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
    if (
      error instanceof Error &&
      new RegExp(`error ${PDFIUM_ERR_PASSWORD}`).test(error.message)
    ) {
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
 * Generate thumbnail for any file type - always returns a thumbnail (placeholder if needed)
 */
export async function generateThumbnailForFile(file: File): Promise<string> {
  // Very large PDFs skip thumbnail generation — SVG icon shown in UI instead
  if (file.size >= LARGE_PDF_PARSE_LIMIT) {
    return "";
  }

  // Handle image files - convert to data URL for persistence
  if (file.type.startsWith("image/")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
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
