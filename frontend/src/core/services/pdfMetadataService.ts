import { FileAnalyzer } from "@app/services/fileAnalyzer";
import {
  getPdfiumModule,
  openRawDocument,
  closeDocAndFreeBuffer,
  readUtf16,
} from "@app/services/pdfiumService";
import {
  TrappedStatus,
  CustomMetadataEntry,
  ExtractedPDFMetadata,
} from "@app/types/metadata";

export interface MetadataExtractionResult {
  success: true;
  metadata: ExtractedPDFMetadata;
}

export interface MetadataExtractionError {
  success: false;
  error: string;
}

export type MetadataExtractionResponse =
  | MetadataExtractionResult
  | MetadataExtractionError;

/**
 * Utility to format PDF date strings to required format (yyyy/MM/dd HH:mm:ss)
 * Handles PDF date format: "D:YYYYMMDDHHmmSSOHH'mm'" or standard date strings
 */
function formatPDFDate(dateString: string): string {
  if (!dateString) {
    return "";
  }

  let date: Date;

  // Check if it's a PDF date format (starts with "D:")
  if (dateString.startsWith("D:")) {
    // Parse PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
    const dateStr = dateString.substring(2); // Remove "D:"

    // Extract date parts
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6));
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(dateStr.substring(8, 10)) || 0;
    const minute = parseInt(dateStr.substring(10, 12)) || 0;
    const second = parseInt(dateStr.substring(12, 14)) || 0;

    // Create date object (month is 0-indexed)
    date = new Date(year, month - 1, day, hour, minute, second);
  } else {
    // Try parsing as regular date string
    date = new Date(dateString);
  }

  if (isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Convert PDFium trapped string value to TrappedStatus enum.
 * FPDF_GetMetaText returns "True", "False", or empty string for the Trapped key.
 */
function convertTrappedStatus(trapped: string): TrappedStatus {
  const lower = trapped.toLowerCase();
  if (lower === "true") return TrappedStatus.TRUE;
  if (lower === "false") return TrappedStatus.FALSE;
  return TrappedStatus.UNKNOWN;
}

/**
 * Read a named metadata tag from an open PDFium document pointer.
 * Returns empty string if the tag is absent or empty.
 */
async function readMetaText(
  docPtr: number,
  tag: string,
): Promise<string> {
  const m = await getPdfiumModule();
  const len = m.FPDF_GetMetaText(docPtr, tag, 0, 0);
  if (len <= 2) return ""; // 2-byte NUL terminator only → empty
  const buf = m.pdfium.wasmExports.malloc(len);
  m.FPDF_GetMetaText(docPtr, tag, buf, len);
  const value = readUtf16(m, buf, len);
  m.pdfium.wasmExports.free(buf);
  return value;
}

/**
 * Extract all metadata from a PDF file using PDFium WASM.
 * Returns a result object with success/error state.
 */
export async function extractPDFMetadata(
  file: File,
): Promise<MetadataExtractionResponse> {
  const isValidPDF = await FileAnalyzer.isValidPDF(file);
  if (!isValidPDF) {
    return {
      success: false,
      error: "File is not a valid PDF",
    };
  }

  const m = await getPdfiumModule();
  let docPtr: number;

  try {
    const arrayBuffer = await file.arrayBuffer();
    docPtr = await openRawDocument(arrayBuffer);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Failed to read PDF: ${errorMessage}`,
    };
  }

  try {
    const [
      title,
      author,
      subject,
      keywords,
      creator,
      producer,
      creationDate,
      modificationDate,
      trappedRaw,
    ] = await Promise.all([
      readMetaText(docPtr, "Title"),
      readMetaText(docPtr, "Author"),
      readMetaText(docPtr, "Subject"),
      readMetaText(docPtr, "Keywords"),
      readMetaText(docPtr, "Creator"),
      readMetaText(docPtr, "Producer"),
      readMetaText(docPtr, "CreationDate"),
      readMetaText(docPtr, "ModDate"),
      readMetaText(docPtr, "Trapped"),
    ]);

    const customMetadata: CustomMetadataEntry[] = [];

    const extractedMetadata: ExtractedPDFMetadata = {
      title,
      author,
      subject,
      keywords,
      creator,
      producer,
      creationDate: formatPDFDate(creationDate),
      modificationDate: formatPDFDate(modificationDate),
      trapped: convertTrappedStatus(trappedRaw),
      customMetadata,
    };

    return {
      success: true,
      metadata: extractedMetadata,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Failed to extract metadata: ${errorMessage}`,
    };
  } finally {
    closeDocAndFreeBuffer(m, docPtr!);
  }
}
