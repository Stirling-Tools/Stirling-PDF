import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import { FileAnalyzer } from "@app/services/fileAnalyzer";
import {
  TrappedStatus,
  CustomMetadataEntry,
  ExtractedPDFMetadata,
} from "@app/types/metadata";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

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
 * Convert PDF.js trapped value to TrappedStatus enum
 * PDF.js returns trapped as { name: "True" | "False" } object
 */
function convertTrappedStatus(trapped: unknown): TrappedStatus {
  if (trapped && typeof trapped === "object" && "name" in trapped) {
    const name = (trapped as Record<string, string>).name?.toLowerCase();
    if (name === "true") return TrappedStatus.TRUE;
    if (name === "false") return TrappedStatus.FALSE;
  }
  return TrappedStatus.UNKNOWN;
}

const STANDARD_METADATA_KEYS = new Set([
  "PDFFormatVersion",
  "Language",
  "EncryptFilterName",
  "IsLinearized",
  "IsAcroFormPresent",
  "IsXFAPresent",
  "IsCollectionPresent",
  "IsSignaturesPresent",
  "Title",
  "Author",
  "Subject",
  "Keywords",
  "Creator",
  "Producer",
  "CreationDate",
  "ModDate",
  "Trapped",
  "Custom",
]);

const STANDARD_XMP_KEYS = new Set([
  "dc:title",
  "dc:creator",
  "dc:description",
  "pdf:Keywords",
  "pdf:Producer",
  "xmp:CreateDate",
  "xmp:CreatorTool",
  "xmp:MetadataDate",
  "xmp:ModifyDate",
]);

type PDFJSMetadata = Iterable<[string, unknown]>;

/**
 * Extract custom metadata fields from PDF.js metadata objects.
 * PDF.js may expose custom metadata under info.Custom, as extra top-level info fields,
 * or as XMP metadata entries.
 */
export function extractCustomMetadata(
  info: Record<string, unknown>,
  xmpMetadata?: PDFJSMetadata | null,
): CustomMetadataEntry[] {
  const customMetadata: CustomMetadataEntry[] = [];
  const seenKeys = new Set<string>();
  let customIdCounter = 1;

  const addMetadataEntry = (key: string, value: unknown) => {
    const normalizedKey = key.toLowerCase();
    if (seenKeys.has(normalizedKey) || value == null || value === "") {
      return;
    }

    customMetadata.push({
      key,
      value: String(value),
      id: `custom${customIdCounter++}`,
    });
    seenKeys.add(normalizedKey);
  };

  if (typeof info.Custom === "object" && info.Custom !== null) {
    Object.entries(info.Custom as Record<string, unknown>).forEach(
      ([key, value]) => {
        addMetadataEntry(key, value);
      },
    );
  }

  Object.entries(info).forEach(([key, value]) => {
    if (!STANDARD_METADATA_KEYS.has(key)) {
      addMetadataEntry(key, value);
    }
  });

  if (xmpMetadata) {
    Array.from(xmpMetadata).forEach(([key, value]) => {
      if (!STANDARD_XMP_KEYS.has(key)) {
        addMetadataEntry(key, value);
      }
    });
  }

  return customMetadata;
}

/**
 * Safely cleanup PDF document with error handling
 */
function cleanupPdfDocument(pdfDoc: PDFDocumentProxy | null): void {
  if (pdfDoc) {
    try {
      pdfWorkerManager.destroyDocument(pdfDoc);
    } catch (cleanupError) {
      console.warn("Failed to cleanup PDF document:", cleanupError);
    }
  }
}

function getXmpStringMetadata(
  xmpMetadata: PDFJSMetadata | null | undefined,
  keys: string[],
): string {
  if (!xmpMetadata) {
    return "";
  }

  const keySet = new Set(keys);
  for (const [key, value] of xmpMetadata) {
    if (keySet.has(key) && typeof value === "string") {
      return value;
    }
  }

  return "";
}

function getStringMetadata(
  info: Record<string, unknown>,
  key: string,
  xmpMetadata?: PDFJSMetadata | null,
  xmpKeys: string[] = [],
): string {
  if (typeof info[key] === "string") {
    return info[key];
  }

  return getXmpStringMetadata(xmpMetadata, xmpKeys);
}

/**
 * Extract all metadata from a PDF file
 * Returns a result object with success/error state
 */
export async function extractPDFMetadata(
  file: File,
): Promise<MetadataExtractionResponse> {
  // Use existing PDF validation
  const isValidPDF = await FileAnalyzer.isValidPDF(file);
  if (!isValidPDF) {
    return {
      success: false,
      error: "File is not a valid PDF",
    };
  }

  let pdfDoc: PDFDocumentProxy | null = null;
  let arrayBuffer: ArrayBuffer;
  let metadata;

  try {
    arrayBuffer = await file.arrayBuffer();
    pdfDoc = await pdfWorkerManager.createDocument(arrayBuffer, {
      disableAutoFetch: true,
      disableStream: true,
    });
    metadata = await pdfDoc.getMetadata();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    cleanupPdfDocument(pdfDoc);
    return {
      success: false,
      error: `Failed to read PDF: ${errorMessage}`,
    };
  }

  const info = metadata.info as Record<string, unknown>;
  const xmpMetadata = metadata.metadata;

  // Safely extract metadata with proper type checking
  const extractedMetadata: ExtractedPDFMetadata = {
    title: getStringMetadata(info, "Title", xmpMetadata, ["dc:title"]),
    author: getStringMetadata(info, "Author", xmpMetadata, ["dc:creator"]),
    subject: getStringMetadata(info, "Subject", xmpMetadata, [
      "dc:description",
    ]),
    keywords: getStringMetadata(info, "Keywords", xmpMetadata, [
      "pdf:Keywords",
    ]),
    creator: getStringMetadata(info, "Creator", xmpMetadata, [
      "xmp:CreatorTool",
    ]),
    producer: getStringMetadata(info, "Producer", xmpMetadata, [
      "pdf:Producer",
    ]),
    creationDate: formatPDFDate(
      getStringMetadata(info, "CreationDate", xmpMetadata, ["xmp:CreateDate"]),
    ),
    modificationDate: formatPDFDate(
      getStringMetadata(info, "ModDate", xmpMetadata, ["xmp:ModifyDate"]),
    ),
    trapped: convertTrappedStatus(info.Trapped),
    customMetadata: extractCustomMetadata(info, xmpMetadata),
  };

  cleanupPdfDocument(pdfDoc);

  return {
    success: true,
    metadata: extractedMetadata,
  };
}
