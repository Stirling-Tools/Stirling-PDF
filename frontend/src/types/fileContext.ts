/**
 * Types for global file context management across views and tools
 */

import { ProcessedFile } from './processing';
import { PDFDocument, PDFPage, PageOperation } from './pageEditor';

export type ModeType = 'viewer' | 'pageEditor' | 'fileEditor' | 'merge' | 'split' | 'compress' | 'ocr' | 'repair';

export type OperationType = 'merge' | 'split' | 'compress' | 'add' | 'remove' | 'replace' | 'convert' | 'upload' | 'ocr' | 'repair';

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
  // Core file management
  activeFiles: File[];
  processedFiles: Map<File, ProcessedFile>;
  
  // Current navigation state
  currentMode: ModeType;
  
  // Edit history and state
  fileEditHistory: Map<string, FileEditHistory>;
  globalFileOperations: FileOperation[];
  // New comprehensive operation history
  fileOperationHistory: Map<string, FileOperationHistory>;
  
  // UI state that persists across views
  selectedFileIds: string[];
  selectedPageNumbers: number[];
  viewerConfig: ViewerConfig;
  
  // Processing state
  isProcessing: boolean;
  processingProgress: number;
  
  // Export state
  lastExportConfig?: {
    filename: string;
    selectedOnly: boolean;
    splitDocuments: boolean;
  };

  // Navigation guard system
  hasUnsavedChanges: boolean;
  pendingNavigation: (() => void) | null;
  showNavigationWarning: boolean;
}

export interface FileContextActions {
  // File management
  addFiles: (files: File[]) => Promise<void>;
  removeFiles: (fileIds: string[], deleteFromStorage?: boolean) => void;
  replaceFile: (oldFileId: string, newFile: File) => Promise<void>;
  clearAllFiles: () => void;
  
  // Navigation
  setCurrentMode: (mode: ModeType) => void;
  // Selection management
  setSelectedFiles: (fileIds: string[]) => void;
  setSelectedPages: (pageNumbers: number[]) => void;
  updateProcessedFile: (file: File, processedFile: ProcessedFile) => void;
  clearSelections: () => void;
  
  // Edit operations
  applyPageOperations: (fileId: string, operations: PageOperation[]) => void;
  applyFileOperation: (operation: FileOperation) => void;
  undoLastOperation: (fileId?: string) => void;
  
  // Operation history management
  recordOperation: (fileId: string, operation: FileOperation | PageOperation) => void;
  markOperationApplied: (fileId: string, operationId: string) => void;
  markOperationFailed: (fileId: string, operationId: string, error: string) => void;
  getFileHistory: (fileId: string) => FileOperationHistory | undefined;
  getAppliedOperations: (fileId: string) => (FileOperation | PageOperation)[];
  clearFileHistory: (fileId: string) => void;
  
  // Viewer state
  updateViewerConfig: (config: Partial<ViewerConfig>) => void;
  
  // Export configuration
  setExportConfig: (config: FileContextState['lastExportConfig']) => void;
  
  
  // Utility
  getFileById: (fileId: string) => File | undefined;
  getProcessedFileById: (fileId: string) => ProcessedFile | undefined;
  getCurrentFile: () => File | undefined;
  getCurrentProcessedFile: () => ProcessedFile | undefined;
  
  // Context persistence
  saveContext: () => Promise<void>;
  loadContext: () => Promise<void>;
  resetContext: () => void;
  
  // Navigation guard system
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  requestNavigation: (navigationFn: () => void) => boolean;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
  
  // Memory management
  trackBlobUrl: (url: string) => void;
  trackPdfDocument: (fileId: string, pdfDoc: any) => void;
  cleanupFile: (fileId: string) => Promise<void>;
  scheduleCleanup: (fileId: string, delay?: number) => void;
}

export interface FileContextValue extends FileContextState, FileContextActions {}

export interface FileContextProviderProps {
  children: React.ReactNode;
  enableUrlSync?: boolean;
  enablePersistence?: boolean;
  maxCacheSize?: number;
}

// Helper types for component props
export interface WithFileContext {
  fileContext: FileContextValue;
}

// URL parameter types for deep linking
export interface FileContextUrlParams {
  mode?: ModeType;
  fileIds?: string[];
  pageIds?: string[];
  zoom?: number;
  page?: number;
}