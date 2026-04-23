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

interface ColorScheme {
  bgTop: string;
  bgBottom: string;
  border: string;
  icon: string;
  badge: string;
  textPrimary: string;
  textSecondary: string;
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

/**
 * Generate encrypted PDF thumbnail with lock icon
 */
function generateEncryptedPDFThumbnail(file: File): string {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 150;
  const ctx = canvas.getContext("2d")!;

  // Use PDF color scheme but with encrypted styling
  const colorScheme = getFileTypeColorScheme("PDF");

  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colorScheme.bgTop);
  gradient.addColorStop(1, colorScheme.bgBottom);

  // Rounded rectangle background
  drawRoundedRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 8);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Border with dashed pattern for encrypted indicator
  ctx.strokeStyle = colorScheme.border;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]); // Reset dash pattern

  // Large lock icon as main element
  drawLargeLockIcon(ctx, canvas.width / 2, canvas.height / 2 - 10, colorScheme);

  // "PDF" text under the lock
  ctx.font =
    'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = colorScheme.icon;
  ctx.textAlign = "center";
  ctx.fillText("PDF", canvas.width / 2, canvas.height / 2 + 35);

  // File size with subtle styling
  const sizeText = formatFileSize(file.size);
  ctx.font =
    '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = colorScheme.textSecondary;
  ctx.textAlign = "center";
  ctx.fillText(sizeText, canvas.width / 2, canvas.height - 15);

  return canvas.toDataURL();
}

/**
 * Generate modern placeholder thumbnail with file extension
 */
function generatePlaceholderThumbnail(file: File): string {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 150;
  const ctx = canvas.getContext("2d")!;

  // Get file extension for color theming
  const extension = file.name.split(".").pop()?.toUpperCase() || "FILE";
  const colorScheme = getFileTypeColorScheme(extension);

  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colorScheme.bgTop);
  gradient.addColorStop(1, colorScheme.bgBottom);

  // Rounded rectangle background
  drawRoundedRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 8);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Subtle shadow/border
  ctx.strokeStyle = colorScheme.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Modern document icon
  drawModernDocumentIcon(ctx, canvas.width / 2, 45, colorScheme.icon);

  // Extension badge
  drawExtensionBadge(
    ctx,
    canvas.width / 2,
    canvas.height / 2 + 15,
    extension,
    colorScheme,
  );

  // File size with subtle styling
  const sizeText = formatFileSize(file.size);
  ctx.font =
    '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = colorScheme.textSecondary;
  ctx.textAlign = "center";
  ctx.fillText(sizeText, canvas.width / 2, canvas.height - 15);

  return canvas.toDataURL();
}

/**
 * Get color scheme based on file extension
 */
function getFileTypeColorScheme(extension: string): ColorScheme {
  const schemes: Record<string, ColorScheme> = {
    // Documents
    PDF: {
      bgTop: "#FF6B6B20",
      bgBottom: "#FF6B6B10",
      border: "#FF6B6B40",
      icon: "#FF6B6B",
      badge: "#FF6B6B",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    DOC: {
      bgTop: "#4ECDC420",
      bgBottom: "#4ECDC410",
      border: "#4ECDC440",
      icon: "#4ECDC4",
      badge: "#4ECDC4",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    DOCX: {
      bgTop: "#4ECDC420",
      bgBottom: "#4ECDC410",
      border: "#4ECDC440",
      icon: "#4ECDC4",
      badge: "#4ECDC4",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    ODT: {
      bgTop: "#4ECDC420",
      bgBottom: "#4ECDC410",
      border: "#4ECDC440",
      icon: "#4ECDC4",
      badge: "#4ECDC4",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    TXT: {
      bgTop: "#95A5A620",
      bgBottom: "#95A5A610",
      border: "#95A5A640",
      icon: "#95A5A6",
      badge: "#95A5A6",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    RTF: {
      bgTop: "#95A5A620",
      bgBottom: "#95A5A610",
      border: "#95A5A640",
      icon: "#95A5A6",
      badge: "#95A5A6",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },

    // Spreadsheets
    XLS: {
      bgTop: "#2ECC7120",
      bgBottom: "#2ECC7110",
      border: "#2ECC7140",
      icon: "#2ECC71",
      badge: "#2ECC71",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    XLSX: {
      bgTop: "#2ECC7120",
      bgBottom: "#2ECC7110",
      border: "#2ECC7140",
      icon: "#2ECC71",
      badge: "#2ECC71",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    ODS: {
      bgTop: "#2ECC7120",
      bgBottom: "#2ECC7110",
      border: "#2ECC7140",
      icon: "#2ECC71",
      badge: "#2ECC71",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    CSV: {
      bgTop: "#2ECC7120",
      bgBottom: "#2ECC7110",
      border: "#2ECC7140",
      icon: "#2ECC71",
      badge: "#2ECC71",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },

    // Presentations
    PPT: {
      bgTop: "#E67E2220",
      bgBottom: "#E67E2210",
      border: "#E67E2240",
      icon: "#E67E22",
      badge: "#E67E22",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    PPTX: {
      bgTop: "#E67E2220",
      bgBottom: "#E67E2210",
      border: "#E67E2240",
      icon: "#E67E22",
      badge: "#E67E22",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    ODP: {
      bgTop: "#E67E2220",
      bgBottom: "#E67E2210",
      border: "#E67E2240",
      icon: "#E67E22",
      badge: "#E67E22",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },

    // Images
    JPG: {
      bgTop: "#FF9F4320",
      bgBottom: "#FF9F4310",
      border: "#FF9F4340",
      icon: "#FF9F43",
      badge: "#FF9F43",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    JPEG: {
      bgTop: "#FF9F4320",
      bgBottom: "#FF9F4310",
      border: "#FF9F4340",
      icon: "#FF9F43",
      badge: "#FF9F43",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    PNG: {
      bgTop: "#FF9F4320",
      bgBottom: "#FF9F4310",
      border: "#FF9F4340",
      icon: "#FF9F43",
      badge: "#FF9F43",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    GIF: {
      bgTop: "#FF9F4320",
      bgBottom: "#FF9F4310",
      border: "#FF9F4340",
      icon: "#FF9F43",
      badge: "#FF9F43",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    BMP: {
      bgTop: "#FF9F4320",
      bgBottom: "#FF9F4310",
      border: "#FF9F4340",
      icon: "#FF9F43",
      badge: "#FF9F43",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    TIFF: {
      bgTop: "#FF9F4320",
      bgBottom: "#FF9F4310",
      border: "#FF9F4340",
      icon: "#FF9F43",
      badge: "#FF9F43",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    WEBP: {
      bgTop: "#FF9F4320",
      bgBottom: "#FF9F4310",
      border: "#FF9F4340",
      icon: "#FF9F43",
      badge: "#FF9F43",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    SVG: {
      bgTop: "#FF9F4320",
      bgBottom: "#FF9F4310",
      border: "#FF9F4340",
      icon: "#FF9F43",
      badge: "#FF9F43",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },

    // Web
    HTML: {
      bgTop: "#FD79A820",
      bgBottom: "#FD79A810",
      border: "#FD79A840",
      icon: "#FD79A8",
      badge: "#FD79A8",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    XML: {
      bgTop: "#FD79A820",
      bgBottom: "#FD79A810",
      border: "#FD79A840",
      icon: "#FD79A8",
      badge: "#FD79A8",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },

    // Text/Markup
    MD: {
      bgTop: "#6C5CE720",
      bgBottom: "#6C5CE710",
      border: "#6C5CE740",
      icon: "#6C5CE7",
      badge: "#6C5CE7",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },

    // Email
    EML: {
      bgTop: "#A29BFE20",
      bgBottom: "#A29BFE10",
      border: "#A29BFE40",
      icon: "#A29BFE",
      badge: "#A29BFE",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },

    // Archives
    ZIP: {
      bgTop: "#9B59B620",
      bgBottom: "#9B59B610",
      border: "#9B59B640",
      icon: "#9B59B6",
      badge: "#9B59B6",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    RAR: {
      bgTop: "#9B59B620",
      bgBottom: "#9B59B610",
      border: "#9B59B640",
      icon: "#9B59B6",
      badge: "#9B59B6",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
    "7Z": {
      bgTop: "#9B59B620",
      bgBottom: "#9B59B610",
      border: "#9B59B640",
      icon: "#9B59B6",
      badge: "#9B59B6",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },

    // Default
    DEFAULT: {
      bgTop: "#74B9FF20",
      bgBottom: "#74B9FF10",
      border: "#74B9FF40",
      icon: "#74B9FF",
      badge: "#74B9FF",
      textPrimary: "#FFFFFF",
      textSecondary: "#666666",
    },
  };

  return schemes[extension] || schemes["DEFAULT"];
}

/**
 * Draw rounded rectangle
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draw modern document icon
 */
function drawModernDocumentIcon(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  color: string,
) {
  const size = 24;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  // Document body
  drawRoundedRect(
    ctx,
    centerX - size / 2,
    centerY - size / 2,
    size,
    size * 1.2,
    3,
  );
  ctx.fill();

  // Folded corner
  ctx.beginPath();
  ctx.moveTo(centerX + size / 2 - 6, centerY - size / 2);
  ctx.lineTo(centerX + size / 2, centerY - size / 2 + 6);
  ctx.lineTo(centerX + size / 2 - 6, centerY - size / 2 + 6);
  ctx.closePath();
  ctx.fillStyle = "#FFFFFF40";
  ctx.fill();
}

/**
 * Draw large lock icon for encrypted PDFs
 */
function drawLargeLockIcon(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  colorScheme: ColorScheme,
) {
  const size = 48;
  ctx.fillStyle = colorScheme.icon;
  ctx.strokeStyle = colorScheme.icon;
  ctx.lineWidth = 3;

  // Lock body (rectangle)
  const bodyWidth = size;
  const bodyHeight = size * 0.75;
  const bodyX = centerX - bodyWidth / 2;
  const bodyY = centerY - bodyHeight / 4;

  drawRoundedRect(ctx, bodyX, bodyY, bodyWidth, bodyHeight, 4);
  ctx.fill();

  // Lock shackle (semicircle)
  const shackleRadius = size * 0.32;
  const shackleY = centerY - size * 0.25;

  ctx.beginPath();
  ctx.arc(centerX, shackleY, shackleRadius, Math.PI, 2 * Math.PI);
  ctx.stroke();

  // Keyhole
  const keyholeX = centerX;
  const keyholeY = bodyY + bodyHeight * 0.4;
  ctx.fillStyle = colorScheme.textPrimary;
  ctx.beginPath();
  ctx.arc(keyholeX, keyholeY, 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillRect(keyholeX - 2, keyholeY, 4, 8);
}

/** PDFium error code 4 = password required (encrypted PDF). */
const PDFIUM_ERR_PASSWORD = 4;

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
 * Draw extension badge
 */
function drawExtensionBadge(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  extension: string,
  colorScheme: ColorScheme,
) {
  const badgeWidth = Math.max(extension.length * 8 + 16, 40);
  const badgeHeight = 22;

  // Badge background
  drawRoundedRect(
    ctx,
    centerX - badgeWidth / 2,
    centerY - badgeHeight / 2,
    badgeWidth,
    badgeHeight,
    11,
  );
  ctx.fillStyle = colorScheme.badge;
  ctx.fill();

  // Badge text
  ctx.font =
    'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = colorScheme.textPrimary;
  ctx.textAlign = "center";
  ctx.fillText(extension, centerX, centerY + 4);
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

async function generatePDFThumbnail(
  arrayBuffer: ArrayBuffer,
  file: File,
  scale: number,
): Promise<string> {
  const result = await renderPdfThumbnailPdfium(
    arrayBuffer,
    scale,
    true,
    false,
  );
  if (result.isEncrypted) {
    return generateEncryptedPDFThumbnail(file);
  }
  return result.thumbnail;
}

/**
 * Generate thumbnail for any file type - always returns a thumbnail (placeholder if needed)
 */
export async function generateThumbnailForFile(file: File): Promise<string> {
  // Skip very large files
  if (file.size >= 100 * 1024 * 1024) {
    return generatePlaceholderThumbnail(file);
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
    const chunkSize = 2 * 1024 * 1024; // 2MB
    const chunk = file.slice(0, Math.min(chunkSize, file.size));
    const arrayBuffer = await chunk.arrayBuffer();

    try {
      return await generatePDFThumbnail(arrayBuffer, file, scale);
    } catch {
      // PDFium needs the xref table at the end of the file, so the 2MB
      // chunk can fail to open for PDFs larger than that. Retry with the
      // full buffer before falling back to a placeholder.
      try {
        const fullArrayBuffer = await file.arrayBuffer();
        return await generatePDFThumbnail(fullArrayBuffer, file, scale);
      } catch (error) {
        console.warn(
          `PDF processing failed for ${file.name} - using placeholder:`,
          error,
        );
        return generatePlaceholderThumbnail(file);
      }
    }
  }

  // All other files get placeholder
  return generatePlaceholderThumbnail(file);
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
  const isVeryLarge = file.size >= 100 * 1024 * 1024; // 100MB threshold

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await renderPdfThumbnailPdfium(
      arrayBuffer,
      scale,
      applyRotation,
      !isVeryLarge,
    );

    if (result.isEncrypted) {
      return {
        thumbnail: generateEncryptedPDFThumbnail(file),
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
  } catch {
    const thumbnail = generatePlaceholderThumbnail(file);
    return { thumbnail, pageCount: 1 };
  }
}
