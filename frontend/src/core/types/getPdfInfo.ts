/** Metadata section from PDF */
export interface PdfMetadata {
  Title?: string | null;
  Author?: string | null;
  Subject?: string | null;
  Keywords?: string | null;
  Creator?: string | null;
  Producer?: string | null;
  CreationDate?: string | null;
  ModificationDate?: string | null;
  [key: string]: unknown;
}

/** Basic info section */
export interface PdfBasicInfo {
  FileSizeInBytes?: number;
  WordCount?: number;
  ParagraphCount?: number;
  CharacterCount?: number;
  Compression?: boolean;
  CompressionType?: string;
  Language?: string | null;
  'Number of pages'?: number;
  TotalImages?: number;
  [key: string]: unknown;
}

/** Document info section */
export interface PdfDocumentInfo {
  'PDF version'?: string;
  Trapped?: string | null;
  'Page Mode'?: string;
  [key: string]: unknown;
}

/** Encryption section */
export interface PdfEncryption {
  IsEncrypted?: boolean;
  EncryptionAlgorithm?: string;
  KeyLength?: number;
  [key: string]: unknown;
}

/** Permissions section - values are "Allowed" or "Not Allowed" */
export interface PdfPermissions {
  'Document Assembly'?: 'Allowed' | 'Not Allowed';
  'Extracting Content'?: 'Allowed' | 'Not Allowed';
  'Extracting for accessibility'?: 'Allowed' | 'Not Allowed';
  'Form Filling'?: 'Allowed' | 'Not Allowed';
  'Modifying'?: 'Allowed' | 'Not Allowed';
  'Modifying annotations'?: 'Allowed' | 'Not Allowed';
  'Printing'?: 'Allowed' | 'Not Allowed';
  [key: string]: 'Allowed' | 'Not Allowed' | undefined;
}

/** Compliance section */
export interface PdfCompliance {
  "IsPDF/ACompliant"?: boolean;
  "PDF/AConformanceLevel"?: string;
  "IsPDF/UACompliant"?: boolean;
  "IsPDF/XCompliant"?: boolean;
  "IsPDF/ECompliant"?: boolean;
  "IsPDF/VTCompliant"?: boolean;
  "IsPDF/BCompliant"?: boolean;
  "IsPDF/SECCompliant"?: boolean;
  // VeraPDF verified content - keys will be standard IDs like "pdfa-2b", "pdfua-1"
  [key: string]: boolean | string | unknown;
}

/** Font info within a page */
export interface PdfFontInfo {
  Name?: string;
  IsEmbedded?: boolean;
  Subtype?: string;
  ItalicAngle?: number;
  IsItalic?: boolean;
  IsBold?: boolean;
  IsFixedPitch?: boolean;
  IsSerif?: boolean;
  IsSymbolic?: boolean;
  IsScript?: boolean;
  IsNonsymbolic?: boolean;
  FontFamily?: string;
  FontWeight?: number;
  Count?: number;
}

/** Image info within a page */
export interface PdfImageInfo {
  Width?: number;
  Height?: number;
  Name?: string;
  ColorSpace?: string;
}

/** Link info within a page */
export interface PdfLinkInfo {
  URI?: string;
}

/** Annotations info within a page */
export interface PdfAnnotationsInfo {
  AnnotationsCount?: number;
  SubtypeCount?: number;
  ContentsCount?: number;
  [key: string]: unknown;
}

/** Size/dimensions info within a page */
export interface PdfSizeInfo {
  'Width (px)'?: string;
  'Height (px)'?: string;
  'Width (in)'?: string;
  'Height (in)'?: string;
  'Width (cm)'?: string;
  'Height (cm)'?: string;
  'Standard Page'?: string;
  [key: string]: unknown;
}

/** XObject counts within a page */
export interface PdfXObjectCounts {
  Image?: number;
  Form?: number;
  Other?: number;
  [key: string]: unknown;
}

/** ICC Profile info */
export interface PdfICCProfile {
  'ICC Profile Length'?: number;
}

/** Page-level information */
export interface PdfPageInfo {
  Size?: PdfSizeInfo;
  Rotation?: number;
  'Page Orientation'?: string;
  MediaBox?: string;
  CropBox?: string;
  BleedBox?: string;
  TrimBox?: string;
  ArtBox?: string;
  'Text Characters Count'?: number;
  Annotations?: PdfAnnotationsInfo;
  Images?: PdfImageInfo[];
  Links?: PdfLinkInfo[];
  Fonts?: PdfFontInfo[];
  'Color Spaces & ICC Profiles'?: PdfICCProfile[];
  XObjectCounts?: PdfXObjectCounts;
  Multimedia?: Record<string, unknown>[];
}

/** Per-page info section (keyed by "Page 1", "Page 2", etc.) */
export interface PdfPerPageInfo {
  [pageLabel: string]: PdfPageInfo;
}

/** Embedded file info */
export interface PdfEmbeddedFileInfo {
  Name?: string;
  FileSize?: number;
  MimeType?: string;
  CreationDate?: string;
  ModificationDate?: string;
}

/** Attachment info */
export interface PdfAttachmentInfo {
  Name?: string;
  Description?: string;
  FileSize?: number;
}

/** JavaScript info */
export interface PdfJavaScriptInfo {
  'JS Name'?: string;
  'JS Script Length'?: number;
}

/** Layer info */
export interface PdfLayerInfo {
  Name?: string;
}

/** Structure tree element */
export interface PdfStructureTreeElement {
  Type?: string;
  Content?: string;
  Children?: PdfStructureTreeElement[];
}

/** Other section with miscellaneous data */
export interface PdfOtherInfo {
  Attachments?: PdfAttachmentInfo[];
  EmbeddedFiles?: PdfEmbeddedFileInfo[];
  JavaScript?: PdfJavaScriptInfo[];
  Layers?: PdfLayerInfo[];
  StructureTree?: PdfStructureTreeElement[];
  'Bookmarks/Outline/TOC'?: PdfTocEntry[];
  XMPMetadata?: string | null;
}

/** Table of contents bookmark entry */
export interface PdfTocEntry {
  Title?: string;
  [key: string]: unknown;
}

/** Compliance summary entry */
export interface PdfComplianceSummary {
  Standard: string;
  Compliant: boolean;
  Summary: string;
}

/** Summary data section */
export interface PdfSummaryData {
  encrypted?: boolean;
  restrictedPermissions?: string[];
  restrictedPermissionsCount?: number;
  Compliance?: PdfComplianceSummary[];
}

/** Form fields section */
export type PdfFormFields = Record<string, string>;

/** Parsed sections with normalized keys for frontend use */
export interface ParsedPdfSections {
  metadata?: PdfMetadata | null;
  formFields?: PdfFormFields | null;
  basicInfo?: PdfBasicInfo | null;
  documentInfo?: PdfDocumentInfo | null;
  compliance?: PdfCompliance | null;
  encryption?: PdfEncryption | null;
  permissions?: PdfPermissions | null;
  toc?: PdfTocEntry[] | null;
  other?: PdfOtherInfo | null;
  perPage?: PdfPerPageInfo | null;
  summaryData?: PdfSummaryData | null;
}

/** Raw backend response structure */
export interface PdfInfoBackendData {
  Metadata?: PdfMetadata;
  FormFields?: PdfFormFields;
  BasicInfo?: PdfBasicInfo;
  DocumentInfo?: PdfDocumentInfo;
  Compliancy?: PdfCompliance;
  Encryption?: PdfEncryption;
  Permissions?: PdfPermissions;
  Other?: PdfOtherInfo;
  PerPageInfo?: PdfPerPageInfo;
  SummaryData?: PdfSummaryData;
  // Legacy/alternative keys for backwards compatibility
  'Form Fields'?: PdfFormFields;
  'Basic Info'?: PdfBasicInfo;
  'Document Info'?: PdfDocumentInfo;
  Compliance?: PdfCompliance;
  'Bookmarks/Outline/TOC'?: PdfTocEntry[];
  'Table of Contents'?: PdfTocEntry[];
  'Per Page Info'?: PdfPerPageInfo;
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
