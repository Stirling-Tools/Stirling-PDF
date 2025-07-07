/**
 * Types for global file context management across views and tools
 */

import { ProcessedFile } from './processing';
import { PDFDocument, PDFPage, PageOperation } from './pageEditor';

export type ViewType = 'viewer' | 'pageEditor' | 'fileEditor';

export type ToolType = 'merge' | 'split' | 'compress' | null;

export interface FileOperation {
  id: string;
  type: 'merge' | 'add' | 'remove' | 'replace';
  timestamp: number;
  fileIds: string[];
  data?: any;
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
  currentView: ViewType;
  currentTool: ToolType;
  
  // Edit history and state
  fileEditHistory: Map<string, FileEditHistory>;
  globalFileOperations: FileOperation[];
  
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
}

export interface FileContextActions {
  // File management
  addFiles: (files: File[]) => Promise<void>;
  removeFiles: (fileIds: string[]) => void;
  replaceFile: (oldFileId: string, newFile: File) => Promise<void>;
  clearAllFiles: () => void;
  
  // Navigation
  setCurrentView: (view: ViewType) => void;
  setCurrentTool: (tool: ToolType) => void;
  
  // Selection management
  setSelectedFiles: (fileIds: string[]) => void;
  setSelectedPages: (pageNumbers: number[]) => void;
  updateProcessedFile: (file: File, processedFile: ProcessedFile) => void;
  clearSelections: () => void;
  
  // Edit operations
  applyPageOperations: (fileId: string, operations: PageOperation[]) => void;
  applyFileOperation: (operation: FileOperation) => void;
  undoLastOperation: (fileId?: string) => void;
  
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
  view?: ViewType;
  tool?: ToolType;
  fileIds?: string[];
  pageIds?: string[];
  zoom?: number;
  page?: number;
}