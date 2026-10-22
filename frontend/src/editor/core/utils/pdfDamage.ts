import { PdfErrorCode } from "@embedpdf/models";

/**
 * PDFium's file and format failures mean the bytes cannot be parsed. Timeouts,
 * memory limits, cancellation and passwords say nothing about the file itself.
 */
export function isDamagedPdfError(error: unknown): boolean {
  if (error instanceof DOMException) return false;
  const code = (error as { code?: unknown } | null)?.code;
  return code === PdfErrorCode.NotFound || code === PdfErrorCode.WrongFormat;
}
