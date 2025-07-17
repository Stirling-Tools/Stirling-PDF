/**
 * Global file context for managing files, edits, and navigation across all views and tools
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { 
  FileContextValue, 
  FileContextState, 
  FileContextProviderProps,
  ModeType,
  ViewType,
  ToolType,
  FileOperation,
  FileEditHistory,
  FileOperationHistory,
  ViewerConfig,
  FileContextUrlParams
} from '../types/fileContext';
import { ProcessedFile } from '../types/processing';
import { PageOperation, PDFDocument } from '../types/pageEditor';
import { useEnhancedProcessedFiles } from '../hooks/useEnhancedProcessedFiles';
import { fileStorage } from '../services/fileStorage';
import { enhancedPDFProcessingService } from '../services/enhancedPDFProcessingService';
import { thumbnailGenerationService } from '../services/thumbnailGenerationService';

// Initial state
const initialViewerConfig: ViewerConfig = {
  zoom: 1.0,
  currentPage: 1,
  viewMode: 'single',
  sidebarOpen: false
};

const initialState: FileContextState = {
  activeFiles: [],
  processedFiles: new Map(),
  currentMode: 'pageEditor',
  currentView: 'fileEditor', // Legacy field
  currentTool: null, // Legacy field
  fileEditHistory: new Map(),
  globalFileOperations: [],
  fileOperationHistory: new Map(),
  selectedFileIds: [],
  selectedPageNumbers: [],
  viewerConfig: initialViewerConfig,
  isProcessing: false,
  processingProgress: 0,
  lastExportConfig: undefined,
  hasUnsavedChanges: false,
  pendingNavigation: null,
  showNavigationWarning: false
};

// Action types
type FileContextAction = 
  | { type: 'SET_ACTIVE_FILES'; payload: File[] }
  | { type: 'ADD_FILES'; payload: File[] }
  | { type: 'REMOVE_FILES'; payload: string[] }
  | { type: 'SET_PROCESSED_FILES'; payload: Map<File, ProcessedFile> }
  | { type: 'UPDATE_PROCESSED_FILE'; payload: { file: File; processedFile: ProcessedFile } }
  | { type: 'SET_CURRENT_MODE'; payload: ModeType }
  | { type: 'SET_CURRENT_VIEW'; payload: ViewType }
  | { type: 'SET_CURRENT_TOOL'; payload: ToolType }
  | { type: 'SET_SELECTED_FILES'; payload: string[] }
  | { type: 'SET_SELECTED_PAGES'; payload: number[] }
  | { type: 'CLEAR_SELECTIONS' }
  | { type: 'SET_PROCESSING'; payload: { isProcessing: boolean; progress: number } }
  | { type: 'UPDATE_VIEWER_CONFIG'; payload: Partial<ViewerConfig> }
  | { type: 'ADD_PAGE_OPERATIONS'; payload: { fileId: string; operations: PageOperation[] } }
  | { type: 'ADD_FILE_OPERATION'; payload: FileOperation }
  | { type: 'RECORD_OPERATION'; payload: { fileId: string; operation: FileOperation | PageOperation } }
  | { type: 'MARK_OPERATION_APPLIED'; payload: { fileId: string; operationId: string } }
  | { type: 'MARK_OPERATION_FAILED'; payload: { fileId: string; operationId: string; error: string } }
  | { type: 'CLEAR_FILE_HISTORY'; payload: string }
  | { type: 'SET_EXPORT_CONFIG'; payload: FileContextState['lastExportConfig'] }
  | { type: 'SET_UNSAVED_CHANGES'; payload: boolean }
  | { type: 'SET_PENDING_NAVIGATION'; payload: (() => void) | null }
  | { type: 'SHOW_NAVIGATION_WARNING'; payload: boolean }
  | { type: 'RESET_CONTEXT' }
  | { type: 'LOAD_STATE'; payload: Partial<FileContextState> };

// Reducer
function fileContextReducer(state: FileContextState, action: FileContextAction): FileContextState {
  switch (action.type) {
    case 'SET_ACTIVE_FILES':
      return {
        ...state,
        activeFiles: action.payload,
        selectedFileIds: [], // Clear selections when files change
        selectedPageNumbers: []
      };

    case 'ADD_FILES':
      return {
        ...state,
        activeFiles: [...state.activeFiles, ...action.payload]
      };

    case 'REMOVE_FILES':
      const remainingFiles = state.activeFiles.filter(file => {
        const fileId = (file as any).id || file.name;
        return !action.payload.includes(fileId);
      });
      const safeSelectedFileIds = Array.isArray(state.selectedFileIds) ? state.selectedFileIds : [];
      return {
        ...state,
        activeFiles: remainingFiles,
        selectedFileIds: safeSelectedFileIds.filter(id => !action.payload.includes(id))
      };

    case 'SET_PROCESSED_FILES':
      return {
        ...state,
        processedFiles: action.payload
      };

    case 'UPDATE_PROCESSED_FILE':
      const updatedProcessedFiles = new Map(state.processedFiles);
      updatedProcessedFiles.set(action.payload.file, action.payload.processedFile);
      return {
        ...state,
        processedFiles: updatedProcessedFiles
      };

    case 'SET_CURRENT_MODE':
      const coreViews = ['viewer', 'pageEditor', 'fileEditor'];
      const isToolMode = !coreViews.includes(action.payload);
      
      return {
        ...state,
        currentMode: action.payload,
        // Update legacy fields for backward compatibility
        currentView: isToolMode ? 'fileEditor' : action.payload as ViewType,
        currentTool: isToolMode ? action.payload as ToolType : null
      };

    case 'SET_CURRENT_VIEW':
      // Legacy action - just update currentMode
      return {
        ...state,
        currentMode: action.payload as ModeType,
        currentView: action.payload,
        currentTool: null
      };

    case 'SET_CURRENT_TOOL':
      // Legacy action - just update currentMode
      return {
        ...state,
        currentMode: action.payload ? action.payload as ModeType : 'pageEditor',
        currentView: action.payload ? 'fileEditor' : 'pageEditor',
        currentTool: action.payload
      };

    case 'SET_SELECTED_FILES':
      return {
        ...state,
        selectedFileIds: action.payload
      };

    case 'SET_SELECTED_PAGES':
      return {
        ...state,
        selectedPageNumbers: action.payload
      };

    case 'CLEAR_SELECTIONS':
      return {
        ...state,
        selectedFileIds: [],
        selectedPageNumbers: []
      };

    case 'SET_PROCESSING':
      return {
        ...state,
        isProcessing: action.payload.isProcessing,
        processingProgress: action.payload.progress
      };

    case 'UPDATE_VIEWER_CONFIG':
      return {
        ...state,
        viewerConfig: {
          ...state.viewerConfig,
          ...action.payload
        }
      };

    case 'ADD_PAGE_OPERATIONS':
      const newHistory = new Map(state.fileEditHistory);
      const existing = newHistory.get(action.payload.fileId);
      newHistory.set(action.payload.fileId, {
        fileId: action.payload.fileId,
        pageOperations: existing ? 
          [...existing.pageOperations, ...action.payload.operations] : 
          action.payload.operations,
        lastModified: Date.now()
      });
      return {
        ...state,
        fileEditHistory: newHistory
      };

    case 'ADD_FILE_OPERATION':
      return {
        ...state,
        globalFileOperations: [...state.globalFileOperations, action.payload]
      };

    case 'RECORD_OPERATION':
      const { fileId, operation } = action.payload;
      const newOperationHistory = new Map(state.fileOperationHistory);
      const existingHistory = newOperationHistory.get(fileId);
      
      if (existingHistory) {
        // Add operation to existing history
        newOperationHistory.set(fileId, {
          ...existingHistory,
          operations: [...existingHistory.operations, operation],
          lastModified: Date.now()
        });
      } else {
        // Create new history for this file
        newOperationHistory.set(fileId, {
          fileId,
          fileName: fileId, // Will be updated with actual filename when available
          operations: [operation],
          createdAt: Date.now(),
          lastModified: Date.now()
        });
      }
      
      return {
        ...state,
        fileOperationHistory: newOperationHistory
      };

    case 'MARK_OPERATION_APPLIED':
      const appliedHistory = new Map(state.fileOperationHistory);
      const appliedFileHistory = appliedHistory.get(action.payload.fileId);
      
      if (appliedFileHistory) {
        const updatedOperations = appliedFileHistory.operations.map(op => 
          op.id === action.payload.operationId 
            ? { ...op, status: 'applied' as const }
            : op
        );
        appliedHistory.set(action.payload.fileId, {
          ...appliedFileHistory,
          operations: updatedOperations,
          lastModified: Date.now()
        });
      }
      
      return {
        ...state,
        fileOperationHistory: appliedHistory
      };

    case 'MARK_OPERATION_FAILED':
      const failedHistory = new Map(state.fileOperationHistory);
      const failedFileHistory = failedHistory.get(action.payload.fileId);
      
      if (failedFileHistory) {
        const updatedOperations = failedFileHistory.operations.map(op => 
          op.id === action.payload.operationId 
            ? { 
                ...op, 
                status: 'failed' as const,
                metadata: { ...op.metadata, error: action.payload.error }
              }
            : op
        );
        failedHistory.set(action.payload.fileId, {
          ...failedFileHistory,
          operations: updatedOperations,
          lastModified: Date.now()
        });
      }
      
      return {
        ...state,
        fileOperationHistory: failedHistory
      };

    case 'CLEAR_FILE_HISTORY':
      const clearedHistory = new Map(state.fileOperationHistory);
      clearedHistory.delete(action.payload);
      return {
        ...state,
        fileOperationHistory: clearedHistory
      };

    case 'SET_EXPORT_CONFIG':
      return {
        ...state,
        lastExportConfig: action.payload
      };

    case 'SET_UNSAVED_CHANGES':
      return {
        ...state,
        hasUnsavedChanges: action.payload
      };

    case 'SET_PENDING_NAVIGATION':
      return {
        ...state,
        pendingNavigation: action.payload
      };

    case 'SHOW_NAVIGATION_WARNING':
      return {
        ...state,
        showNavigationWarning: action.payload
      };

    case 'RESET_CONTEXT':
      return {
        ...initialState
      };

    case 'LOAD_STATE':
      return {
        ...state,
        ...action.payload
      };

    default:
      return state;
  }
}

// Context
const FileContext = createContext<FileContextValue | undefined>(undefined);

// Provider component
export function FileContextProvider({ 
  children, 
  enableUrlSync = true,
  enablePersistence = true,
  maxCacheSize = 1024 * 1024 * 1024 // 1GB
}: FileContextProviderProps) {
  const [state, dispatch] = useReducer(fileContextReducer, initialState);
  
  // Cleanup timers and refs
  const cleanupTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const blobUrls = useRef<Set<string>>(new Set());
  const pdfDocuments = useRef<Map<string, any>>(new Map());
  
  // Enhanced file processing hook
  const {
    processedFiles,
    processingStates,
    isProcessing: globalProcessing,
    processingProgress,
    actions: processingActions
  } = useEnhancedProcessedFiles(state.activeFiles, {
    strategy: 'progressive_chunked',
    thumbnailQuality: 'medium',
    chunkSize: 5, // Process 5 pages at a time for smooth progress
    priorityPageCount: 0 // No special priority pages
  });

  // Update processed files when they change
  useEffect(() => {
    dispatch({ type: 'SET_PROCESSED_FILES', payload: processedFiles });
    dispatch({ 
      type: 'SET_PROCESSING', 
      payload: { 
        isProcessing: globalProcessing, 
        progress: processingProgress.overall 
      }
    });
  }, [processedFiles, globalProcessing, processingProgress.overall]);


  // Centralized memory management
  const trackBlobUrl = useCallback((url: string) => {
    blobUrls.current.add(url);
  }, []);

  const trackPdfDocument = useCallback((fileId: string, pdfDoc: any) => {
    // Clean up existing document for this file if any
    const existing = pdfDocuments.current.get(fileId);
    if (existing && existing.destroy) {
      try {
        existing.destroy();
      } catch (error) {
        console.warn('Error destroying existing PDF document:', error);
      }
    }
    pdfDocuments.current.set(fileId, pdfDoc);
  }, []);

  const cleanupFile = useCallback(async (fileId: string) => {
    console.log('Cleaning up file:', fileId);
    
    try {
      // Cancel any pending cleanup timer
      const timer = cleanupTimers.current.get(fileId);
      if (timer) {
        clearTimeout(timer);
        cleanupTimers.current.delete(fileId);
      }

      // Cleanup PDF document instances (but preserve processed file cache)
      const pdfDoc = pdfDocuments.current.get(fileId);
      if (pdfDoc && pdfDoc.destroy) {
        pdfDoc.destroy();
        pdfDocuments.current.delete(fileId);
      }

      // IMPORTANT: Don't cancel processing or clear cache during normal view switches
      // Only do this when file is actually being removed
      // enhancedPDFProcessingService.cancelProcessing(fileId);
      // thumbnailGenerationService.stopGeneration();

    } catch (error) {
      console.warn('Error during file cleanup:', error);
    }
  }, []);

  const cleanupAllFiles = useCallback(() => {
    console.log('Cleaning up all files');
    
    try {
      // Clear all timers
      cleanupTimers.current.forEach(timer => clearTimeout(timer));
      cleanupTimers.current.clear();

      // Destroy all PDF documents
      pdfDocuments.current.forEach((pdfDoc, fileId) => {
        if (pdfDoc && pdfDoc.destroy) {
          try {
            pdfDoc.destroy();
          } catch (error) {
            console.warn(`Error destroying PDF document for ${fileId}:`, error);
          }
        }
      });
      pdfDocuments.current.clear();

      // Revoke all blob URLs
      blobUrls.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          console.warn('Error revoking blob URL:', error);
        }
      });
      blobUrls.current.clear();

      // Clear all processing
      enhancedPDFProcessingService.clearAllProcessing();

      // Destroy thumbnails
      thumbnailGenerationService.destroy();

      // Force garbage collection hint
      if (typeof window !== 'undefined' && window.gc) {
        setTimeout(() => window.gc(), 100);
      }

    } catch (error) {
      console.warn('Error during cleanup all files:', error);
    }
  }, []);

  const scheduleCleanup = useCallback((fileId: string, delay: number = 30000) => {
    // Cancel existing timer
    const existingTimer = cleanupTimers.current.get(fileId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      cleanupTimers.current.delete(fileId);
    }

    // If delay is negative, just cancel (don't reschedule)
    if (delay < 0) {
      return;
    }

    // Schedule new cleanup
    const timer = setTimeout(() => {
      cleanupFile(fileId);
    }, delay);
    
    cleanupTimers.current.set(fileId, timer);
  }, [cleanupFile]);

  // Action implementations
  const addFiles = useCallback(async (files: File[]) => {
    dispatch({ type: 'ADD_FILES', payload: files });
    
    // Auto-save to IndexedDB if persistence enabled
    if (enablePersistence) {
      for (const file of files) {
        try {
          // Check if file already has an ID (already in IndexedDB)
          const fileId = (file as any).id;
          if (!fileId) {
            // File doesn't have ID, store it and get the ID
            const storedFile = await fileStorage.storeFile(file);
            // Add the ID to the file object
            Object.defineProperty(file, 'id', { value: storedFile.id, writable: false });
          }
        } catch (error) {
          console.error('Failed to store file:', error);
        }
      }
    }
  }, [enablePersistence]);

  const removeFiles = useCallback((fileIds: string[], deleteFromStorage: boolean = true) => {
    // FULL cleanup for actually removed files (including cache)
    fileIds.forEach(fileId => {
      // Cancel processing and clear caches when file is actually removed
      enhancedPDFProcessingService.cancelProcessing(fileId);
      cleanupFile(fileId);
    });
    
    dispatch({ type: 'REMOVE_FILES', payload: fileIds });
    
    // Remove from IndexedDB only if requested
    if (enablePersistence && deleteFromStorage) {
      fileIds.forEach(async (fileId) => {
        try {
          await fileStorage.deleteFile(fileId);
        } catch (error) {
          console.error('Failed to remove file from storage:', error);
        }
      });
    }
  }, [enablePersistence, cleanupFile]);


  const replaceFile = useCallback(async (oldFileId: string, newFile: File) => {
    // Remove old file and add new one
    removeFiles([oldFileId]);
    await addFiles([newFile]);
  }, [removeFiles, addFiles]);

  const clearAllFiles = useCallback(() => {
    // Cleanup all memory before clearing files
    cleanupAllFiles();
    
    dispatch({ type: 'SET_ACTIVE_FILES', payload: [] });
    dispatch({ type: 'CLEAR_SELECTIONS' });
  }, [cleanupAllFiles]);

  // Navigation guard system functions
  const setHasUnsavedChanges = useCallback((hasChanges: boolean) => {
    dispatch({ type: 'SET_UNSAVED_CHANGES', payload: hasChanges });
  }, []);

  const requestNavigation = useCallback((navigationFn: () => void): boolean => {
    if (state.hasUnsavedChanges) {
      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: navigationFn });
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: true });
      return false;
    } else {
      navigationFn();
      return true;
    }
  }, [state.hasUnsavedChanges]);

  const confirmNavigation = useCallback(() => {
    if (state.pendingNavigation) {
      state.pendingNavigation();
      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: null });
    }
    dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: false });
  }, [state.pendingNavigation]);

  const cancelNavigation = useCallback(() => {
    dispatch({ type: 'SET_PENDING_NAVIGATION', payload: null });
    dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: false });
  }, []);

  const setCurrentMode = useCallback((mode: ModeType) => {
    requestNavigation(() => {
      dispatch({ type: 'SET_CURRENT_MODE', payload: mode });
      
      if (state.currentMode !== mode && state.activeFiles.length > 0) {
        if (window.requestIdleCallback && typeof window !== 'undefined' && window.gc) {
          window.requestIdleCallback(() => {
            window.gc();
          }, { timeout: 5000 });
        }
      }
    });
  }, [requestNavigation, state.currentMode, state.activeFiles]);

  const setCurrentView = useCallback((view: ViewType) => {
    requestNavigation(() => {
      dispatch({ type: 'SET_CURRENT_VIEW', payload: view });
      
      if (state.currentView !== view && state.activeFiles.length > 0) {
        if (window.requestIdleCallback && typeof window !== 'undefined' && window.gc) {
          window.requestIdleCallback(() => {
            window.gc();
          }, { timeout: 5000 });
        }
      }
    });
  }, [requestNavigation, state.currentView, state.activeFiles]);

  const setCurrentTool = useCallback((tool: ToolType) => {
    requestNavigation(() => {
      dispatch({ type: 'SET_CURRENT_TOOL', payload: tool });
    });
  }, [requestNavigation]);

  const setSelectedFiles = useCallback((fileIds: string[]) => {
    dispatch({ type: 'SET_SELECTED_FILES', payload: fileIds });
  }, []);

  const setSelectedPages = useCallback((pageNumbers: number[]) => {
    dispatch({ type: 'SET_SELECTED_PAGES', payload: pageNumbers });
  }, []);

  const updateProcessedFile = useCallback((file: File, processedFile: ProcessedFile) => {
    dispatch({ type: 'UPDATE_PROCESSED_FILE', payload: { file, processedFile } });
  }, []);

  const clearSelections = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTIONS' });
  }, []);

  const applyPageOperations = useCallback((fileId: string, operations: PageOperation[]) => {
    dispatch({ 
      type: 'ADD_PAGE_OPERATIONS', 
      payload: { fileId, operations }
    });
  }, []);

  const applyFileOperation = useCallback((operation: FileOperation) => {
    dispatch({ type: 'ADD_FILE_OPERATION', payload: operation });
  }, []);

  const undoLastOperation = useCallback((fileId?: string) => {
    console.warn('Undo not yet implemented');
  }, []);

  const updateViewerConfig = useCallback((config: Partial<ViewerConfig>) => {
    dispatch({ type: 'UPDATE_VIEWER_CONFIG', payload: config });
  }, []);

  const setExportConfig = useCallback((config: FileContextState['lastExportConfig']) => {
    dispatch({ type: 'SET_EXPORT_CONFIG', payload: config });
  }, []);

  // Operation history management functions
  const recordOperation = useCallback((fileId: string, operation: FileOperation | PageOperation) => {
    dispatch({ type: 'RECORD_OPERATION', payload: { fileId, operation } });
  }, []);

  const markOperationApplied = useCallback((fileId: string, operationId: string) => {
    dispatch({ type: 'MARK_OPERATION_APPLIED', payload: { fileId, operationId } });
  }, []);

  const markOperationFailed = useCallback((fileId: string, operationId: string, error: string) => {
    dispatch({ type: 'MARK_OPERATION_FAILED', payload: { fileId, operationId, error } });
  }, []);

  const getFileHistory = useCallback((fileId: string): FileOperationHistory | undefined => {
    return state.fileOperationHistory.get(fileId);
  }, [state.fileOperationHistory]);

  const getAppliedOperations = useCallback((fileId: string): (FileOperation | PageOperation)[] => {
    const history = state.fileOperationHistory.get(fileId);
    return history ? history.operations.filter(op => op.status === 'applied') : [];
  }, [state.fileOperationHistory]);

  const clearFileHistory = useCallback((fileId: string) => {
    dispatch({ type: 'CLEAR_FILE_HISTORY', payload: fileId });
  }, []);

  // Utility functions
  const getFileById = useCallback((fileId: string): File | undefined => {
    return state.activeFiles.find(file => {
      const actualFileId = (file as any).id || file.name;
      return actualFileId === fileId;
    });
  }, [state.activeFiles]);

  const getProcessedFileById = useCallback((fileId: string): ProcessedFile | undefined => {
    const file = getFileById(fileId);
    return file ? state.processedFiles.get(file) : undefined;
  }, [getFileById, state.processedFiles]);

  const getCurrentFile = useCallback((): File | undefined => {
    if (state.selectedFileIds.length > 0) {
      return getFileById(state.selectedFileIds[0]);
    }
    return state.activeFiles[0]; // Default to first file
  }, [state.selectedFileIds, state.activeFiles, getFileById]);

  const getCurrentProcessedFile = useCallback((): ProcessedFile | undefined => {
    const file = getCurrentFile();
    return file ? state.processedFiles.get(file) : undefined;
  }, [getCurrentFile, state.processedFiles]);

  // Context persistence
  const saveContext = useCallback(async () => {
    if (!enablePersistence) return;
    
    try {
      const contextData = {
        currentView: state.currentView,
        currentTool: state.currentTool,
        selectedFileIds: state.selectedFileIds,
        selectedPageIds: state.selectedPageIds,
        viewerConfig: state.viewerConfig,
        lastExportConfig: state.lastExportConfig,
        timestamp: Date.now()
      };
      
      localStorage.setItem('fileContext', JSON.stringify(contextData));
    } catch (error) {
      console.error('Failed to save context:', error);
    }
  }, [state, enablePersistence]);

  const loadContext = useCallback(async () => {
    if (!enablePersistence) return;
    
    try {
      const saved = localStorage.getItem('fileContext');
      if (saved) {
        const contextData = JSON.parse(saved);
        dispatch({ type: 'LOAD_STATE', payload: contextData });
      }
    } catch (error) {
      console.error('Failed to load context:', error);
    }
  }, [enablePersistence]);

  const resetContext = useCallback(() => {
    dispatch({ type: 'RESET_CONTEXT' });
    if (enablePersistence) {
      localStorage.removeItem('fileContext');
    }
  }, [enablePersistence]);


  // Auto-save context when it changes
  useEffect(() => {
    saveContext();
  }, [saveContext]);

  // Load context on mount
  useEffect(() => {
    loadContext();
  }, [loadContext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('FileContext unmounting - cleaning up all resources');
      cleanupAllFiles();
    };
  }, [cleanupAllFiles]);

  const contextValue: FileContextValue = {
    // State
    ...state,
    
    // Actions
    addFiles,
    removeFiles,
    replaceFile,
    clearAllFiles,
    setCurrentMode,
    setCurrentView,
    setCurrentTool,
    setSelectedFiles,
    setSelectedPages,
    updateProcessedFile,
    clearSelections,
    applyPageOperations,
    applyFileOperation,
    undoLastOperation,
    updateViewerConfig,
    setExportConfig,
    getFileById,
    getProcessedFileById,
    getCurrentFile,
    getCurrentProcessedFile,
    saveContext,
    loadContext,
    resetContext,
    
    // Operation history management
    recordOperation,
    markOperationApplied,
    markOperationFailed,
    getFileHistory,
    getAppliedOperations,
    clearFileHistory,
    
    // Navigation guard system
    setHasUnsavedChanges,
    requestNavigation,
    confirmNavigation,
    cancelNavigation,
    
    // Memory management
    trackBlobUrl,
    trackPdfDocument,
    cleanupFile,
    scheduleCleanup
  };

  return (
    <FileContext.Provider value={contextValue}>
      {children}
    </FileContext.Provider>
  );
}

// Custom hook to use the context
export function useFileContext(): FileContextValue {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFileContext must be used within a FileContextProvider');
  }
  return context;
}

// Helper hooks for specific aspects
export function useCurrentFile() {
  const { getCurrentFile, getCurrentProcessedFile } = useFileContext();
  return {
    file: getCurrentFile(),
    processedFile: getCurrentProcessedFile()
  };
}

export function useFileSelection() {
  const { 
    selectedFileIds, 
    selectedPageIds, 
    setSelectedFiles, 
    setSelectedPages, 
    clearSelections 
  } = useFileContext();
  
  return {
    selectedFileIds,
    selectedPageIds,
    setSelectedFiles,
    setSelectedPages,
    clearSelections
  };
}

export function useViewerState() {
  const { viewerConfig, updateViewerConfig } = useFileContext();
  return {
    config: viewerConfig,
    updateConfig: updateViewerConfig
  };
}