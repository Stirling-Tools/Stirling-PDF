/**
 * Types for global file context management across views and tools
 */

import { ProcessedFile } from './processing';
import { PDFDocument, PDFPage, PageOperation } from './pageEditor';

export type ModeType = 'viewer' | 'pageEditor' | 'fileEditor' | 'merge' | 'split' | 'compress' | 'ocr';

// Normalized state types
export type FileId = string;

export interface FileRecord {
  id: FileId;
  file: File;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  thumbnailUrl?: string;
  blobUrl?: string;
  processedFile?: ProcessedFile;
  createdAt: number;
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
    file,
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
  // Core file management - normalized state
  files: FileContextNormalizedFiles;
  
  // UI state grouped for performance
  ui: {
    // Current navigation state
    currentMode: ModeType;
    
    // UI state that persists across views
    selectedFileIds: string[];
    selectedPageNumbers: number[];
    viewerConfig: ViewerConfig;
    
    // Tool selection state (replaces FileSelectionContext)
    toolMode: boolean;
    maxFiles: number; // 1=single, >1=limited, -1=unlimited
    currentTool?: string;
    
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
  };
  
  // Edit history and state (less frequently accessed)
  history: {
    fileEditHistory: Map<string, FileEditHistory>;
    globalFileOperations: FileOperation[];
    fileOperationHistory: Map<string, FileOperationHistory>;
  };
}

// Action types for reducer pattern
export type FileContextAction = 
  // File management actions
  | { type: 'ADD_FILES'; payload: { files: File[] } }
  | { type: 'REMOVE_FILES'; payload: { fileIds: FileId[] } }
  | { type: 'UPDATE_FILE_RECORD'; payload: { id: FileId; updates: Partial<FileRecord> } }
  | { type: 'CLEAR_ALL_FILES' }
  
  // UI actions
  | { type: 'SET_MODE'; payload: { mode: ModeType } }
  | { type: 'SET_SELECTED_FILES'; payload: { fileIds: string[] } }
  | { type: 'SET_SELECTED_PAGES'; payload: { pageNumbers: number[] } }
  | { type: 'CLEAR_SELECTIONS' }
  | { type: 'SET_PROCESSING'; payload: { isProcessing: boolean; progress: number } }
  | { type: 'UPDATE_VIEWER_CONFIG'; payload: { config: Partial<ViewerConfig> } }
  | { type: 'SET_EXPORT_CONFIG'; payload: { config: FileContextState['ui']['lastExportConfig'] } }
  
  // Tool selection actions (replaces FileSelectionContext)
  | { type: 'SET_TOOL_MODE'; payload: { toolMode: boolean } }
  | { type: 'SET_MAX_FILES'; payload: { maxFiles: number } }
  | { type: 'SET_CURRENT_TOOL'; payload: { currentTool?: string } }
  
  // Navigation guard actions
  | { type: 'SET_UNSAVED_CHANGES'; payload: { hasChanges: boolean } }
  | { type: 'SET_PENDING_NAVIGATION'; payload: { navigationFn: (() => void) | null } }
  | { type: 'SHOW_NAVIGATION_WARNING'; payload: { show: boolean } }
  | { type: 'CONFIRM_NAVIGATION' }
  | { type: 'CANCEL_NAVIGATION' }
  
  // History actions
  | { type: 'ADD_PAGE_OPERATIONS'; payload: { fileId: string; operations: PageOperation[] } }
  | { type: 'ADD_FILE_OPERATION'; payload: { operation: FileOperation } }
  | { type: 'RECORD_OPERATION'; payload: { fileId: string; operation: FileOperation | PageOperation } }
  | { type: 'MARK_OPERATION_APPLIED'; payload: { fileId: string; operationId: string } }
  | { type: 'MARK_OPERATION_FAILED'; payload: { fileId: string; operationId: string; error: string } }
  | { type: 'CLEAR_FILE_HISTORY'; payload: { fileId: string } }
  
  // Context management
  | { type: 'RESET_CONTEXT' }
  | { type: 'LOAD_STATE'; payload: { state: Partial<FileContextState> } };

export interface FileContextActions {
  // File management
  addFiles: (files: File[]) => Promise<File[]>;
  removeFiles: (fileIds: string[], deleteFromStorage?: boolean) => void;
  replaceFile: (oldFileId: string, newFile: File) => Promise<void>;
  clearAllFiles: () => void;
  
  // Navigation
  setMode: (mode: ModeType) => void;
  
  // Selection management
  setSelectedFiles: (fileIds: string[]) => void;
  setSelectedPages: (pageNumbers: number[]) => void;
  clearSelections: () => void;
  
  // Tool selection management (replaces FileSelectionContext)
  setToolMode: (toolMode: boolean) => void;
  setMaxFiles: (maxFiles: number) => void;
  setCurrentTool: (currentTool?: string) => void;
  
  // Processing state
  setProcessing: (isProcessing: boolean, progress: number) => void;
  
  // Viewer state
  updateViewerConfig: (config: Partial<FileContextState['ui']['viewerConfig']>) => void;
  
  // Export configuration
  setExportConfig: (config: FileContextState['ui']['lastExportConfig']) => void;
  
  // Navigation guard system
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  requestNavigation: (navigationFn: () => void) => boolean;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
  
  // Context management
  resetContext: () => void;
}

// Legacy compatibility interface - includes legacy properties expected by existing components
export interface FileContextValue extends FileContextState, FileContextActions {
  // Legacy properties for backward compatibility
  activeFiles?: File[];
  selectedFileIds?: string[];
  isProcessing?: boolean;
  processedFiles?: Map<File, any>;
  setCurrentView?: (mode: ModeType) => void;
  setCurrentMode?: (mode: ModeType) => void;
  recordOperation?: (fileId: string, operation: FileOperation) => void;
  markOperationApplied?: (fileId: string, operationId: string) => void;
  getFileHistory?: (fileId: string) => FileOperationHistory | undefined;
  getAppliedOperations?: (fileId: string) => (FileOperation | PageOperation)[];
}

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

// Selector types for split context pattern
export interface FileContextSelectors {
  // File selectors
  getFileById: (id: FileId) => FileRecord | undefined;
  getFilesByIds: (ids: FileId[]) => FileRecord[];
  getAllFiles: () => FileRecord[];
  getSelectedFiles: () => FileRecord[];
  
  // Convenience file helpers
  getFile: (id: FileId) => File | undefined;
  getFiles: (ids?: FileId[]) => File[];
  
  // UI selectors
  getCurrentMode: () => ModeType;
  getSelectedFileIds: () => string[];
  getSelectedPageNumbers: () => number[];
  getViewerConfig: () => ViewerConfig;
  getProcessingState: () => { isProcessing: boolean; progress: number };
  
  // Navigation guard selectors
  getHasUnsavedChanges: () => boolean;
  getShowNavigationWarning: () => boolean;
  
  // History selectors (legacy - moved to selectors from actions)
  getFileHistory: (fileId: string) => FileOperationHistory | undefined;
  getAppliedOperations: (fileId: string) => (FileOperation | PageOperation)[];
}

// Split context value types
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