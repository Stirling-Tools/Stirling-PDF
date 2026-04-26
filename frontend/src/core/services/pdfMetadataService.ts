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

const STANDARD_INFO_KEYS = new Set([
  "Title",
  "Author",
  "Subject",
  "Keywords",
  "Creator",
  "Producer",
  "CreationDate",
  "ModDate",
  "Trapped",
]);

function decodePdfLiteralString(raw: string): string {
  return raw
    .slice(1, -1)
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\\/g, "\\")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\(\d{1,3})/g, (_, oct) =>
      String.fromCharCode(parseInt(oct, 8)),
    );
}

function decodePdfHexString(raw: string): string {
  const hex = raw.slice(1, -1).replace(/\s/g, "");
  const upper = hex.toUpperCase();
  // UTF-16BE with BOM
  if (upper.startsWith("FEFF")) {
    const codeUnits: number[] = [];
    for (let i = 4; i + 3 < hex.length; i += 4) {
      codeUnits.push(
        (parseInt(hex.slice(i, i + 2), 16) << 8) |
          parseInt(hex.slice(i + 2, i + 4), 16),
      );
    }
    return String.fromCharCode(...codeUnits);
  }
  let result = "";
  for (let i = 0; i < hex.length; i += 2) {
    result += String.fromCharCode(parseInt(hex.slice(i, i + 2) || "0", 16));
  }
  return result;
}

/**
 * Extract non-standard key-value pairs from the PDF document Info dictionary.
 * PDFium's FPDF_GetMetaText can only read by key name; this function parses
 * the raw Info object to enumerate all keys so custom entries are not lost.
 * Returns empty array gracefully for PDFs that cannot be parsed (e.g. xref streams).
 */
function extractInfoDictCustomEntries(
  arrayBuffer: ArrayBuffer,
): CustomMetadataEntry[] {
  const text = new TextDecoder("latin1").decode(new Uint8Array(arrayBuffer));

  const trailerIdx = text.lastIndexOf("trailer");
  if (trailerIdx === -1) return [];

  const trailerChunk = text.slice(
    trailerIdx,
    Math.min(trailerIdx + 4096, text.length),
  );
  const infoRef = trailerChunk.match(/\/Info\s+(\d+)\s+(\d+)\s+R/);
  if (!infoRef) return [];

  const [, objNum, genNum] = infoRef;
  const objHeader = `${objNum} ${genNum} obj`;
  const objIdx = text.lastIndexOf(objHeader);
  if (objIdx === -1) return [];

  const endobjIdx = text.indexOf("endobj", objIdx);
  if (endobjIdx === -1) return [];

  const objBody = text.slice(objIdx + objHeader.length, endobjIdx);
  const dictOpen = objBody.indexOf("<<");
  if (dictOpen === -1) return [];

  let depth = 0;
  let dictClose = -1;
  for (let i = dictOpen; i < objBody.length - 1; i++) {
    if (objBody[i] === "<" && objBody[i + 1] === "<") {
      depth++;
      i++;
    } else if (objBody[i] === ">" && objBody[i + 1] === ">") {
      depth--;
      if (depth === 0) {
        dictClose = i;
        break;
      }
      i++;
    }
  }
  if (dictClose === -1) return [];

  const dict = objBody.slice(dictOpen + 2, dictClose);
  const entries: CustomMetadataEntry[] = [];
  let idCounter = 1;

  const pairRe =
    /\/([A-Za-z]\w*)\s*(\((?:[^()\\]|\\.|\([^)]*\))*\)|<[0-9a-fA-F\s]*>)/g;
  let match;
  while ((match = pairRe.exec(dict)) !== null) {
    const key = match[1];
    if (STANDARD_INFO_KEYS.has(key)) continue;
    const raw = match[2];
    const value = raw.startsWith("(")
      ? decodePdfLiteralString(raw)
      : decodePdfHexString(raw);
    if (value) {
      entries.push({ key, value, id: `custom${idCounter++}` });
    }
  }

  return entries;
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

    const customMetadata = extractInfoDictCustomEntries(arrayBuffer);

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
