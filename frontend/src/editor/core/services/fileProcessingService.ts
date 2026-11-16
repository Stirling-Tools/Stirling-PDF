/**
 * Shape of the per-file metadata (page count, per-page thumbnails and rotation)
 * that FileContext stores against a file stub.
 */

export interface ProcessedFileMetadata {
  totalPages: number;
  pages: Array<{
    pageNumber: number;
    thumbnail?: string;
    rotation: number;
    splitBefore: boolean;
  }>;
  thumbnailUrl?: string; // Page 1 thumbnail for FileEditor
  lastProcessed: number;
}
