/**
 * Types for global file context management across views and tools
 */

import { ProcessedFile } from './processing';
import { PDFDocument, PDFPage, PageOperation } from './pageEditor';
import { FileMetadata } from './file';

export type ModeType = 'viewer' | 'pageEditor' | 'fileEditor' | 'merge' | 'split' | 'compress' | 'ocr' | 'convert';

// Normalized state types
export type FileId = string;

export interface FileRecord {
  id: FileId;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  quickKey: string; // Fast deduplication key: name|size|lastModified
  thumbnailUrl?: string;
  blobUrl?: string;
  createdAt: number;
  processedFile?: {
    pages: Array<{
      thumbnail?: string;
      [key: string]: any;
    }>;
    [key: string]: any;
  };
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
    return window.crypto.randomUUID();
  }
  // Fallback for environments without randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Generate quick deduplication key from file metadata
export function createQuickKey(file: File): string {
  // Format: name|size|lastModified for fast duplicate detection
  return `${file.name}|${file.size}|${file.lastModified}`;
}

// Legacy support - now just delegates to createFileId
export function createStableFileId(file: File): FileId {
  // Don't mutate File objects - always return new UUID
  return createFileId();
}


export function toFileRecord(file: File, id?: FileId): FileRecord {
  const fileId = id || createStableFileId(file);
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
  fileIds: string[];
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
  fileId: string;
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
  fileId: string;
  pageOperations: PageOperation[];
  lastModified: number;
}

export interface FileContextState {
  // Core file management - lightweight file IDs only
  files: {
    ids: FileId[];
    byId: Record<FileId, FileRecord>;
  };
  
  // UI state - flat structure for performance
  ui: {
    currentMode: ModeType;
    selectedFileIds: FileId[];
    selectedPageNumbers: number[];
    isProcessing: boolean;
    processingProgress: number;
    hasUnsavedChanges: boolean;
    pendingNavigation: (() => void) | null;
    showNavigationWarning: boolean;
  };
}

// Action types for reducer pattern
export type FileContextAction = 
  // File management actions
  | { type: 'ADD_FILES'; payload: { fileRecords: FileRecord[] } }
  | { type: 'REMOVE_FILES'; payload: { fileIds: FileId[] } }
  | { type: 'UPDATE_FILE_RECORD'; payload: { id: FileId; updates: Partial<FileRecord> } }
  
  // UI actions
  | { type: 'SET_CURRENT_MODE'; payload: ModeType }
  | { type: 'SET_SELECTED_FILES'; payload: { fileIds: FileId[] } }
  | { type: 'SET_SELECTED_PAGES'; payload: { pageNumbers: number[] } }
  | { type: 'CLEAR_SELECTIONS' }
  | { type: 'SET_PROCESSING'; payload: { isProcessing: boolean; progress: number } }
  
  // Navigation guard actions
  | { type: 'SET_UNSAVED_CHANGES'; payload: { hasChanges: boolean } }
  | { type: 'SET_PENDING_NAVIGATION'; payload: { navigationFn: (() => void) | null } }
  | { type: 'SHOW_NAVIGATION_WARNING'; payload: { show: boolean } }
  
  // Context management
  | { type: 'RESET_CONTEXT' };

export interface FileContextActions {
  // File management - lightweight actions only
  addFiles: (files: File[]) => Promise<File[]>;
  addProcessedFiles: (filesWithThumbnails: Array<{ file: File; thumbnail?: string; pageCount?: number }>) => Promise<File[]>;
  addStoredFiles: (filesWithMetadata: Array<{ file: File; originalId: FileId; metadata: FileMetadata }>) => Promise<File[]>;
  removeFiles: (fileIds: FileId[], deleteFromStorage?: boolean) => void;
  updateFileRecord: (id: FileId, updates: Partial<FileRecord>) => void;
  clearAllFiles: () => void;


  // Navigation
  setCurrentMode: (mode: ModeType) => void;
  
  // Selection management
  setSelectedFiles: (fileIds: FileId[]) => void;
  setSelectedPages: (pageNumbers: number[]) => void;
  clearSelections: () => void;
  
  // Processing state - simple flags only
  setProcessing: (isProcessing: boolean, progress?: number) => void;
  
  // Navigation guard system
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  
  // Context management
  resetContext: () => void;
  
  // Legacy compatibility
  setMode: (mode: ModeType) => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
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

// URL parameter types for deep linking
export interface FileContextUrlParams {
  mode?: ModeType;
  fileIds?: string[];
  pageIds?: string[];
  zoom?: number;
  page?: number;
}

