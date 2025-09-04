/**
 * Types for global file context management across views and tools
 */

import { PageOperation } from './pageEditor';
import { FileId, FileMetadata } from './file';

export type ModeType =
  | 'viewer'
  | 'pageEditor'
  | 'fileEditor'
  | 'merge'
  | 'split'
  | 'compress'
  | 'ocr'
  | 'convert'
  | 'sanitize'
  | 'addPassword'
  | 'changePermissions'
  | 'addWatermark'
  | 'removePassword'
  | 'single-large-page'
  | 'repair'
  | 'unlockPdfForms'
  | 'removeCertificateSign';

// Normalized state types
export interface ProcessedFilePage {
  thumbnail?: string;
  pageNumber?: number;
  rotation?: number;
  splitBefore?: boolean;
  [key: string]: any;
}

export interface ProcessedFileMetadata {
  pages: ProcessedFilePage[];
  totalPages?: number;
  thumbnailUrl?: string;
  lastProcessed?: number;
  [key: string]: any;
}

export interface FileRecord {
  id: FileId;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  quickKey?: string; // Fast deduplication key: name|size|lastModified
  thumbnailUrl?: string;
  blobUrl?: string;
  createdAt?: number;
  processedFile?: ProcessedFileMetadata;
  insertAfterPageId?: string; // Page ID after which this file should be inserted
  isPinned?: boolean;
  
  // File history tracking (from PDF metadata)
  originalFileId?: string; // Root file ID for grouping versions
  versionNumber?: number; // Version number in chain  
  parentFileId?: FileId; // Immediate parent file ID
  toolHistory?: Array<{
    toolName: string;
    timestamp: number;
    parameters?: Record<string, any>;
  }>;
  
  // Note: File object stored in provider ref, not in state
}

export interface FileContextNormalizedFiles {
  ids: FileId[];
  byId: Record<FileId, FileRecord>;
}

// Helper functions - UUID-based primary keys (zero collisions, synchronous)
export function createFileId(): FileId {
  // Use crypto.randomUUID for authoritative primary key
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID() as FileId;
  }
  // Fallback for environments without randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
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



export function toFileRecord(file: File, id?: FileId): FileRecord {
  const fileId = id || createFileId();
  return {
    id: fileId,
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    quickKey: createQuickKey(file),
    createdAt: Date.now()
  };
}

export function revokeFileResources(record: FileRecord): void {
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

export type OperationType = 'merge' | 'split' | 'compress' | 'add' | 'remove' | 'replace' | 'convert' | 'upload' | 'ocr' | 'sanitize';

export interface FileOperation {
  id: string;
  type: OperationType;
  timestamp: number;
  fileIds: FileId[];
  status: 'pending' | 'applied' | 'failed';
  data?: any;
  metadata?: {
    originalFileName?: string;
    outputFileNames?: string[];
    parameters?: Record<string, any>;
    fileSize?: number;
    pageCount?: number;
    error?: string;
  };
}

export interface FileOperationHistory {
  fileId: FileId;
  fileName: string;
  operations: (FileOperation | PageOperation)[];
  createdAt: number;
  lastModified: number;
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
    byId: Record<FileId, FileRecord>;
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
  };
}

// Action types for reducer pattern
export type FileContextAction =
  // File management actions
  | { type: 'ADD_FILES'; payload: { fileRecords: FileRecord[] } }
  | { type: 'REMOVE_FILES'; payload: { fileIds: FileId[] } }
  | { type: 'UPDATE_FILE_RECORD'; payload: { id: FileId; updates: Partial<FileRecord> } }
  | { type: 'REORDER_FILES'; payload: { orderedFileIds: FileId[] } }

  // Pinned files actions
  | { type: 'PIN_FILE'; payload: { fileId: FileId } }
  | { type: 'UNPIN_FILE'; payload: { fileId: FileId } }
  | { type: 'CONSUME_FILES'; payload: { inputFileIds: FileId[]; outputFileRecords: FileRecord[] } }
  | { type: 'UNDO_CONSUME_FILES'; payload: { inputFileRecords: FileRecord[]; outputFileIds: FileId[] } }

  // UI actions
  | { type: 'SET_SELECTED_FILES'; payload: { fileIds: FileId[] } }
  | { type: 'SET_SELECTED_PAGES'; payload: { pageNumbers: number[] } }
  | { type: 'CLEAR_SELECTIONS' }
  | { type: 'SET_PROCESSING'; payload: { isProcessing: boolean; progress: number } }

  // Navigation guard actions (minimal for file-related unsaved changes only)
  | { type: 'SET_UNSAVED_CHANGES'; payload: { hasChanges: boolean } }

  // Context management
  | { type: 'RESET_CONTEXT' };

export interface FileContextActions {
  // File management - lightweight actions only
  addFiles: (files: File[], options?: { insertAfterPageId?: string; selectFiles?: boolean }) => Promise<File[]>;
  addProcessedFiles: (filesWithThumbnails: Array<{ file: File; thumbnail?: string; pageCount?: number }>) => Promise<File[]>;
  addStoredFiles: (filesWithMetadata: Array<{ file: File; originalId: FileId; metadata: FileMetadata }>, options?: { selectFiles?: boolean }) => Promise<File[]>;
  removeFiles: (fileIds: FileId[], deleteFromStorage?: boolean) => Promise<void>;
  updateFileRecord: (id: FileId, updates: Partial<FileRecord>) => void;
  reorderFiles: (orderedFileIds: FileId[]) => void;
  clearAllFiles: () => Promise<void>;
  clearAllData: () => Promise<void>;

  // File pinning
  pinFile: (file: File) => void;
  unpinFile: (file: File) => void;

  // File consumption (replace unpinned files with outputs)
  consumeFiles: (inputFileIds: FileId[], outputFiles: File[]) => Promise<FileId[]>;
  undoConsumeFiles: (inputFiles: File[], inputFileRecords: FileRecord[], outputFileIds: FileId[]) => Promise<void>;
  // Selection management
  setSelectedFiles: (fileIds: FileId[]) => void;
  setSelectedPages: (pageNumbers: number[]) => void;
  clearSelections: () => void;

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
}

// File selectors (separate from actions to avoid re-renders)
export interface FileContextSelectors {
  // File access - no state dependency, uses ref
  getFile: (id: FileId) => File | undefined;
  getFiles: (ids?: FileId[]) => File[];

  // Record access - uses normalized state
  getFileRecord: (id: FileId) => FileRecord | undefined;
  getFileRecords: (ids?: FileId[]) => FileRecord[];

  // Derived selectors
  getAllFileIds: () => FileId[];
  getSelectedFiles: () => File[];
  getSelectedFileRecords: () => FileRecord[];

  // Pinned files selectors
  getPinnedFileIds: () => FileId[];
  getPinnedFiles: () => File[];
  getPinnedFileRecords: () => FileRecord[];
  isFilePinned: (file: File) => boolean;

  // Stable signature for effect dependencies
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

// TODO: URL parameter types will be redesigned for new routing system

