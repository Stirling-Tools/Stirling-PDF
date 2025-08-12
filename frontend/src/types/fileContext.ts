/**
 * Types for global file context management across views and tools
 */

import { ProcessedFile } from './processing';
import { PDFDocument, PDFPage, PageOperation } from './pageEditor';

export type ModeType = 'viewer' | 'pageEditor' | 'fileEditor' | 'merge' | 'split' | 'compress' | 'ocr' | 'convert';

// Normalized state types
export type FileId = string;

export interface FileRecord {
  id: FileId;
  name: string;
  size: number;
  type: string;
  lastModified: number;
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

// Helper functions
export function createStableFileId(file: File): FileId {
  // Use existing ID if file already has one, otherwise create stable ID from metadata
  return (file as any).id || `${file.name}-${file.size}-${file.lastModified}`;
}

export function toFileRecord(file: File, id?: FileId): FileRecord {
  const fileId = id || createStableFileId(file);
  return {
    id: fileId,
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    createdAt: Date.now()
  };
}

export function revokeFileResources(record: FileRecord): void {
  if (record.thumbnailUrl) {
    URL.revokeObjectURL(record.thumbnailUrl);
  }
  if (record.blobUrl) {
    URL.revokeObjectURL(record.blobUrl);
  }
  // Clean up processed file thumbnails
  if (record.processedFile?.pages) {
    record.processedFile.pages.forEach(page => {
      if (page.thumbnail && page.thumbnail.startsWith('blob:')) {
        URL.revokeObjectURL(page.thumbnail);
      }
    });
  }
}

export type OperationType = 'merge' | 'split' | 'compress' | 'add' | 'remove' | 'replace' | 'convert' | 'upload' | 'ocr';

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
  | { type: 'ADD_FILES'; payload: { files: File[] } }
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
  removeFiles: (fileIds: FileId[], deleteFromStorage?: boolean) => void;
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
