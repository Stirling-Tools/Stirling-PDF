export interface PdfInfoBackendData {
  // Raw backend payload keyed by human-readable section names
  // Example keys: "Metadata", "Form Fields", "Basic Info", "Document Info",
  // "Compliance", "Encryption", "Permissions", "Table of Contents",
  // "Other", "Per Page Info"
  [sectionName: string]: unknown;
}

export interface PdfInfoReportEntry {
  fileId: string;
  fileName: string;
  fileSize: number | null;
  lastModified: number | null;
  thumbnailUrl?: string | null;
  data: PdfInfoBackendData;
  error: string | null;
  summaryGeneratedAt?: number;
}

export interface PdfInfoReportData {
  generatedAt: number;
  entries: PdfInfoReportEntry[];
}

export const INFO_JSON_FILENAME = 'response.json';
export const INFO_PDF_FILENAME = 'pdf-information-report.pdf';


