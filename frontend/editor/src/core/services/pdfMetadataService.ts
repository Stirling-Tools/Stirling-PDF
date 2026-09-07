import { getFullMetadata } from "@app/services/pdfiumService";
import { FileAnalyzer } from "@app/services/fileAnalyzer";
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

function formatPDFDate(dateString: string): string {
  if (!dateString) {
    return "";
  }

  let date: Date;

  if (dateString.startsWith("D:")) {
    const dateStr = dateString.substring(2);
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6));
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(dateStr.substring(8, 10)) || 0;
    const minute = parseInt(dateStr.substring(10, 12)) || 0;
    const second = parseInt(dateStr.substring(12, 14)) || 0;

    date = new Date(year, month - 1, day, hour, minute, second);
  } else {
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

  try {
    const arrayBuffer = await file.arrayBuffer();
    const meta = await getFullMetadata(arrayBuffer);

    let trapped = TrappedStatus.UNKNOWN;
    if (meta.trapped === "True") trapped = TrappedStatus.TRUE;
    else if (meta.trapped === "False") trapped = TrappedStatus.FALSE;

    const customMetadata: CustomMetadataEntry[] = meta.customMetadata.map(
      (entry) => ({
        id: entry.id,
        key: entry.key,
        value: entry.value,
      }),
    );

    return {
      success: true,
      metadata: {
        title: meta.title,
        author: meta.author,
        subject: meta.subject,
        keywords: meta.keywords,
        creator: meta.creator,
        producer: meta.producer,
        creationDate: formatPDFDate(meta.creationDate),
        modificationDate: formatPDFDate(meta.modificationDate),
        trapped,
        customMetadata,
      },
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Failed to read PDF: ${errorMessage}`,
    };
  }
}
