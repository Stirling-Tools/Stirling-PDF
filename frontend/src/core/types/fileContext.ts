/**
 * Types for global file context management across views and tools
 */

import { PageOperation } from '@app/types/pageEditor';
import { FileId, BaseFileMetadata } from '@app/types/file';

// Re-export FileId for convenience
export type { FileId };

// Normalized state types
export interface ProcessedFilePage {
  thumbnail?: string;
  pageNumber?: number;
  rotation?: number;
  splitBefore?: boolean;
  width?: number;
  height?: number;
  [key: string]: any;
}

export interface ProcessedFileMetadata {
  pages: ProcessedFilePage[];
  totalPages?: number;
  lastProcessed?: number;
  isEncrypted?: boolean;
  [key: string]: any;
}

/**
 * StirlingFileStub - Metadata record for files in the active workbench session
 *
 * Contains UI display data and processing state. Actual File objects stored
 * separately in refs for memory efficiency. Supports multi-tool workflows
 * where files persist across tool operations.
 */
/**
 * StirlingFileStub - Runtime UI metadata for files in the active workbench session
 *
 * Contains UI display data and processing state. Actual File objects stored
 * separately in refs for memory efficiency. Supports multi-tool workflows
 * where files persist across tool operations.
 */
export interface StirlingFileStub extends BaseFileMetadata {
  quickKey?: string;             // Fast deduplication key: name|size|lastModified
  thumbnailUrl?: string;         // Generated thumbnail blob URL for visual display
  blobUrl?: string;             // File access blob URL for downloads/processing
  localFilePath?: string;        // Original local filesystem path (desktop app only)
  processedFile?: ProcessedFileMetadata; // PDF page data and processing results
  insertAfterPageId?: string;   // Page ID after which this file should be inserted
  isPinned?: boolean;           // Protected from tool consumption (replace/remove)
  isDirty?: boolean;            // Has unsaved changes (only for files with localFilePath)
  // Note: File object stored in provider ref, not in state
}

export interface FileContextNormalizedFiles {
  ids: FileId[];
  byId: Record<FileId, StirlingFileStub>;
}

// Helper functions - UUID-based primary keys (zero collisions, synchronous)
export function createFileId(): FileId {
  // Use crypto.randomUUID for authoritative primary key
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID() as FileId;
  }
  // Fallback for environments without randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  }) as FileId;
}

// Generate quick deduplication key from file metadata
export function createQuickKey(file: File): string {
  // Format: name|size|lastModified for fast duplicate detection
  return `${file.name}|${file.size}|${file.lastModified}`;
}

// Stirling PDF file with embedded UUID - replaces loose File + FileId parameter passing
export interface StirlingFile extends File {
  readonly fileId: FileId;
  readonly quickKey: string; // Fast deduplication key: name|size|lastModified
}

// Type guard to check if a File object has an embedded fileId
export function isStirlingFile(file: File | Blob): file is StirlingFile {
  return file instanceof File && 'fileId' in file && typeof (file as any).fileId === 'string' &&
    'quickKey' in file && typeof (file as any).quickKey === 'string';
}

/**
 * Generate a unique identifier for form fill state tracking.
 * This ensures that form widgets/values are correctly isolated between files
 * even if they have the same name or are re-scanned.
 */
export function getFormFillFileId(file: File | Blob | null | undefined): string | null {
  if (!file) return null;

  if (isStirlingFile(file)) {
    return `stirling-${file.fileId}`;
  }

  if (file instanceof File) {
    return `file-${file.name}-${file.size}-${file.lastModified}`;
  }

  // Fallback for Blobs or other objects
  return `blob-${(file as any).size || 0}`;
}

// Create a StirlingFile from a regular File object
export function createStirlingFile(file: File, id?: FileId): StirlingFile {
  // If the file already has Stirling metadata and we aren't trying to override it,
  // return as–is. When a new id is requested we clone the File so we can embed
  // the fresh identifier without mutating the original object.
  if (isStirlingFile(file)) {
    if (!id || file.fileId === id) {
      return file;
    }

    file = new File([file], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  }

  const fileId = id || createFileId();
  const quickKey = createQuickKey(file);

  // Use Object.defineProperty to add properties while preserving the original File object
  // This maintains proper method binding and avoids "Illegal invocation" errors
  Object.defineProperty(file, 'fileId', {
    value: fileId,
    writable: false,
    enumerable: true,
    configurable: false
  });

  Object.defineProperty(file, 'quickKey', {
    value: quickKey,
    writable: false,
    enumerable: true,
    configurable: false
  });

  return file as StirlingFile;
}

// Extract FileIds from StirlingFile array
export function extractFileIds(files: StirlingFile[]): FileId[] {
  return files.map(file => file.fileId);
}

// Extract regular File objects from StirlingFile array
export function extractFiles(files: StirlingFile[]): File[] {
  return files as File[];
}

// Check if an object is a File or StirlingFile (replaces instanceof File checks)
export function isFileObject(obj: any): obj is File | StirlingFile {
  return obj &&
    typeof obj.name === 'string' &&
    typeof obj.size === 'number' &&
    typeof obj.type === 'string' &&
    typeof obj.lastModified === 'number' &&
    typeof obj.arrayBuffer === 'function';
}



export function createNewStirlingFileStub(
  file: File,
  id?: FileId,
  thumbnail?: string,
  processedFileMetadata?: ProcessedFileMetadata
): StirlingFileStub {
  const fileId = id || createFileId();
  return {
    id: fileId,
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    originalFileId: fileId,
    quickKey: createQuickKey(file),
    createdAt: Date.now(),
    isLeaf: true, // New files are leaf nodes by default
    versionNumber: 1, // New files start at version 1
    thumbnailUrl: thumbnail,
    processedFile: processedFileMetadata
  };
}

export function revokeFileResources(record: StirlingFileStub): void {
  // Only revoke blob: URLs to prevent errors on other schemes
  if (record.thumbnailUrl && record.thumbnailUrl.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(record.thumbnailUrl);
    } catch (error) {
      console.warn('Failed to revoke thumbnail URL:', error);
    }
  }
  if (record.blobUrl && record.blobUrl.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(record.blobUrl);
    } catch (error) {
      console.warn('Failed to revoke blob URL:', error);
    }
  }
  // Clean up processed file thumbnails
  if (record.processedFile?.pages) {
    record.processedFile.pages.forEach(page => {
      if (page.thumbnail && page.thumbnail.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(page.thumbnail);
        } catch (error) {
          console.warn('Failed to revoke page thumbnail URL:', error);
        }
      }
    });
  }
}

export interface ViewerConfig {
  zoom: number;
  currentPage: number;
  viewMode: 'single' | 'continuous' | 'facing';
  sidebarOpen: boolean;
}

export interface FileEditHistory {
  fileId: FileId;
  pageOperations: PageOperation[];
  lastModified: number;
}

export interface FileContextState {
  // Core file management - lightweight file IDs only
  files: {
    ids: FileId[];
    byId: Record<FileId, StirlingFileStub>;
  };

  // Pinned files - files that won't be consumed by tools
  pinnedFiles: Set<FileId>;

  // UI state - file-related UI state only
  ui: {
    selectedFileIds: FileId[];
    selectedPageNumbers: number[];
    isProcessing: boolean;
    processingProgress: number;
    hasUnsavedChanges: boolean;
    errorFileIds: FileId[]; // files that errored during processing
  };
}

// Action types for reducer pattern
export type FileContextAction =
  // File management actions
  | { type: 'ADD_FILES'; payload: { stirlingFileStubs: StirlingFileStub[] } }
  | { type: 'REMOVE_FILES'; payload: { fileIds: FileId[] } }
  | { type: 'UPDATE_FILE_RECORD'; payload: { id: FileId; updates: Partial<StirlingFileStub> } }
  | { type: 'REORDER_FILES'; payload: { orderedFileIds: FileId[] } }

  // Pinned files actions
  | { type: 'PIN_FILE'; payload: { fileId: FileId } }
  | { type: 'UNPIN_FILE'; payload: { fileId: FileId } }
  | { type: 'CONSUME_FILES'; payload: { inputFileIds: FileId[]; outputStirlingFileStubs: StirlingFileStub[] } }
  | { type: 'UNDO_CONSUME_FILES'; payload: { inputStirlingFileStubs: StirlingFileStub[]; outputFileIds: FileId[] } }

  // UI actions
  | { type: 'SET_SELECTED_FILES'; payload: { fileIds: FileId[] } }
  | { type: 'SET_SELECTED_PAGES'; payload: { pageNumbers: number[] } }
  | { type: 'CLEAR_SELECTIONS' }
  | { type: 'SET_PROCESSING'; payload: { isProcessing: boolean; progress: number } }
  | { type: 'MARK_FILE_ERROR'; payload: { fileId: FileId } }
  | { type: 'CLEAR_FILE_ERROR'; payload: { fileId: FileId } }
  | { type: 'CLEAR_ALL_FILE_ERRORS' }

  // Navigation guard actions (minimal for file-related unsaved changes only)
  | { type: 'SET_UNSAVED_CHANGES'; payload: { hasChanges: boolean } }

  // Context management
  | { type: 'RESET_CONTEXT' };

export interface FileContextActions {
  // File management - lightweight actions only
  addFiles: (files: File[], options?: { insertAfterPageId?: string; selectFiles?: boolean }) => Promise<StirlingFile[]>;
  addFilesWithOptions: (
    files: File[],
    options?: {
      insertAfterPageId?: string;
      selectFiles?: boolean;
      autoUnzip?: boolean;
      autoUnzipFileLimit?: number;
      skipAutoUnzip?: boolean;
      confirmLargeExtraction?: (fileCount: number, fileName: string) => Promise<boolean>;
      allowDuplicates?: boolean;
    }
  ) => Promise<StirlingFile[]>;
  addStirlingFileStubs: (stirlingFileStubs: StirlingFileStub[], options?: { insertAfterPageId?: string; selectFiles?: boolean }) => Promise<StirlingFile[]>;
  removeFiles: (fileIds: FileId[], deleteFromStorage?: boolean) => Promise<void>;
  updateStirlingFileStub: (id: FileId, updates: Partial<StirlingFileStub>) => void;
  reorderFiles: (orderedFileIds: FileId[]) => void;
  clearAllFiles: () => Promise<void>;
  clearAllData: () => Promise<void>;

  // File pinning - accepts StirlingFile for safer type checking
  pinFile: (file: StirlingFile) => void;
  unpinFile: (file: StirlingFile) => void;

  // File consumption (replace unpinned files with outputs)
  consumeFiles: (inputFileIds: FileId[], outputStirlingFiles: StirlingFile[], outputStirlingFileStubs: StirlingFileStub[]) => Promise<FileId[]>;
  undoConsumeFiles: (inputFiles: File[], inputStirlingFileStubs: StirlingFileStub[], outputFileIds: FileId[]) => Promise<void>;
  // Selection management
  setSelectedFiles: (fileIds: FileId[]) => void;
  setSelectedPages: (pageNumbers: number[]) => void;
  clearSelections: () => void;
  markFileError: (fileId: FileId) => void;
  clearFileError: (fileId: FileId) => void;
  clearAllFileErrors: () => void;

  // Processing state - simple flags only
  setProcessing: (isProcessing: boolean, progress?: number) => void;

  // File-related unsaved changes (minimal navigation guard support)
  setHasUnsavedChanges: (hasChanges: boolean) => void;

  // Context management
  resetContext: () => void;

  // Resource management
  trackBlobUrl: (url: string) => void;
  scheduleCleanup: (fileId: FileId, delay?: number) => void;
  cleanupFile: (fileId: FileId) => void;
  openEncryptedUnlockPrompt: (fileId: FileId) => void;
}

// File selectors (separate from actions to avoid re-renders)
export interface FileContextSelectors {
  getFile: (id: FileId) => StirlingFile | undefined;
  getFiles: (ids?: FileId[]) => StirlingFile[];
  getStirlingFileStub: (id: FileId) => StirlingFileStub | undefined;
  getStirlingFileStubs: (ids?: FileId[]) => StirlingFileStub[];
  getAllFileIds: () => FileId[];
  getSelectedFiles: () => StirlingFile[];
  getSelectedStirlingFileStubs: () => StirlingFileStub[];
  getPinnedFileIds: () => FileId[];
  getPinnedFiles: () => StirlingFile[];
  getPinnedStirlingFileStubs: () => StirlingFileStub[];
  isFilePinned: (file: StirlingFile) => boolean;
  getFilesSignature: () => string;
}

export interface FileContextProviderProps {
  children: React.ReactNode;
  enableUrlSync?: boolean;
  enablePersistence?: boolean;
  maxCacheSize?: number;
}

// Split context values to minimize re-renders
export interface FileContextStateValue {
  state: FileContextState;
  selectors: FileContextSelectors;
}

export interface FileContextActionsValue {
  actions: FileContextActions;
  dispatch: (action: FileContextAction) => void;
}
