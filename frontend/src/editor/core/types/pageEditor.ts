import { FileId } from "@app/types/file";

export interface PDFPage {
  id: string;
  pageNumber: number;
  originalPageNumber: number;
  thumbnail: string | null;
  rotation: number;
  selected: boolean;
  splitAfter?: boolean;
  isBlankPage?: boolean;
  /** A blank page's size in PDF points, before rotation; A4 when absent. */
  blankSize?: { width: number; height: number };
  isPlaceholder?: boolean;
  originalFileId?: FileId;
}

export interface PDFDocument {
  id: string;
  name: string;
  file: File;
  pages: PDFPage[];
  totalPages: number;
  destroy?: () => void;
}

export interface PageOperation {
  id: string;
  type: "rotate" | "delete" | "move" | "split" | "insert" | "reorder";
  pageIds: string[];
  timestamp: number;
  status: "pending" | "applied" | "failed";
  data?: unknown;
  metadata?: {
    rotation?: number;
    fromPosition?: number;
    toPosition?: number;
    splitType?: string;
    insertAfterPage?: number;
    error?: string;
  };
}
