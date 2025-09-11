import { pdfWorkerManager } from './pdfWorkerManager';
import { FileAnalyzer } from './fileAnalyzer';
import { TrappedStatus, CustomMetadataEntry, ExtractedPDFMetadata } from '../types/metadata';

export interface MetadataExtractionResult {
  success: true;
  metadata: ExtractedPDFMetadata;
}

export interface MetadataExtractionError {
  success: false;
  error: string;
}

export type MetadataExtractionResponse = MetadataExtractionResult | MetadataExtractionError;

/**
 * Utility to format PDF date strings to required format (yyyy/MM/dd HH:mm:ss)
 * Handles PDF date format: "D:YYYYMMDDHHmmSSOHH'mm'" or standard date strings
 */
function formatPDFDate(dateString: unknown): string {
  if (!dateString || typeof dateString !== 'string') {
    return '';
  }

  try {
    let date: Date;

    // Check if it's a PDF date format (starts with "D:")
    if (dateString.startsWith('D:')) {
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
      return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  } catch {
    return '';
  }
}

/**
 * Convert PDF.js trapped value to TrappedStatus enum
 * PDF.js returns trapped as { name: "True" | "False" } object
 */
function convertTrappedStatus(trapped: unknown): TrappedStatus {
  if (trapped && typeof trapped === 'object' && 'name' in trapped) {
    const name = (trapped as Record<string, string>).name?.toLowerCase();
    if (name === 'true') return TrappedStatus.TRUE;
    if (name === 'false') return TrappedStatus.FALSE;
  }
  return TrappedStatus.UNKNOWN;
}

/**
 * Extract custom metadata fields from PDF.js info object
 * Custom metadata is nested under the "Custom" key
 */
function extractCustomMetadata(info: Record<string, unknown>): CustomMetadataEntry[] {
  const customMetadata: CustomMetadataEntry[] = [];
  let customIdCounter = 1;


  // Check if there's a Custom object containing the custom metadata
  if (info.Custom && typeof info.Custom === 'object' && info.Custom !== null) {
    const customObj = info.Custom as Record<string, unknown>;

    Object.entries(customObj).forEach(([key, value]) => {
      if (value != null && value !== '') {
        const entry = {
          key,
          value: String(value),
          id: `custom${customIdCounter++}`
        };
        customMetadata.push(entry);
      }
    });
  }

  return customMetadata;
}

/**
 * Service to extract metadata from PDF files using PDF.js
 */
export class PDFMetadataService {
  /**
   * Extract all metadata from a PDF file
   * Returns a result object with success/error state
   */
  static async extractMetadata(file: File): Promise<MetadataExtractionResponse> {
    // Use existing PDF validation
    const isValidPDF = await FileAnalyzer.isValidPDF(file);
    if (!isValidPDF) {
      return {
        success: false,
        error: 'File is not a valid PDF'
      };
    }

    let pdfDoc: any = null;

    try {
      const arrayBuffer = await file.arrayBuffer();
      pdfDoc = await pdfWorkerManager.createDocument(arrayBuffer, {
        disableAutoFetch: true,
        disableStream: true
      });

      const metadata = await pdfDoc.getMetadata();
      const info = metadata.info || {};

      // Safely extract metadata with proper type checking
      const extractedMetadata: ExtractedPDFMetadata = {
        title: typeof info.Title === 'string' ? info.Title : '',
        author: typeof info.Author === 'string' ? info.Author : '',
        subject: typeof info.Subject === 'string' ? info.Subject : '',
        keywords: typeof info.Keywords === 'string' ? info.Keywords : '',
        creator: typeof info.Creator === 'string' ? info.Creator : '',
        producer: typeof info.Producer === 'string' ? info.Producer : '',
        creationDate: formatPDFDate(info.CreationDate),
        modificationDate: formatPDFDate(info.ModDate),
        trapped: convertTrappedStatus(info.Trapped),
        customMetadata: extractCustomMetadata(info)
      };

      return {
        success: true,
        metadata: extractedMetadata
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to extract PDF metadata: ${errorMessage}`
      };

    } finally {
      // Ensure cleanup even if extraction fails
      if (pdfDoc) {
        try {
          pdfWorkerManager.destroyDocument(pdfDoc);
        } catch (cleanupError) {
          console.warn('Failed to cleanup PDF document:', cleanupError);
        }
      }
    }
  }
}
