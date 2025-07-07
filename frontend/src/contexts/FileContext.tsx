/**
 * Global file context for managing files, edits, and navigation across all views and tools
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  FileContextValue, 
  FileContextState, 
  FileContextProviderProps,
  ViewType,
  ToolType,
  FileOperation,
  FileEditHistory,
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
  currentView: 'fileEditor',
  currentTool: null,
  fileEditHistory: new Map(),
  globalFileOperations: [],
  selectedFileIds: [],
  selectedPageNumbers: [],
  viewerConfig: initialViewerConfig,
  isProcessing: false,
  processingProgress: 0,
  lastExportConfig: undefined
};

// Action types
type FileContextAction = 
  | { type: 'SET_ACTIVE_FILES'; payload: File[] }
  | { type: 'ADD_FILES'; payload: File[] }
  | { type: 'REMOVE_FILES'; payload: string[] }
  | { type: 'SET_PROCESSED_FILES'; payload: Map<File, ProcessedFile> }
  | { type: 'UPDATE_PROCESSED_FILE'; payload: { file: File; processedFile: ProcessedFile } }
  | { type: 'SET_CURRENT_VIEW'; payload: ViewType }
  | { type: 'SET_CURRENT_TOOL'; payload: ToolType }
  | { type: 'SET_SELECTED_FILES'; payload: string[] }
  | { type: 'SET_SELECTED_PAGES'; payload: number[] }
  | { type: 'CLEAR_SELECTIONS' }
  | { type: 'SET_PROCESSING'; payload: { isProcessing: boolean; progress: number } }
  | { type: 'UPDATE_VIEWER_CONFIG'; payload: Partial<ViewerConfig> }
  | { type: 'ADD_PAGE_OPERATIONS'; payload: { fileId: string; operations: PageOperation[] } }
  | { type: 'ADD_FILE_OPERATION'; payload: FileOperation }
  | { type: 'SET_EXPORT_CONFIG'; payload: FileContextState['lastExportConfig'] }
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
      const remainingFiles = state.activeFiles.filter(file => 
        !action.payload.includes(file.name) // Simple ID for now, could use file.name or generate IDs
      );
      return {
        ...state,
        activeFiles: remainingFiles,
        selectedFileIds: state.selectedFileIds.filter(id => !action.payload.includes(id))
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

    case 'SET_CURRENT_VIEW':
      return {
        ...state,
        currentView: action.payload,
        // Clear tool when switching views
        currentTool: null
      };

    case 'SET_CURRENT_TOOL':
      return {
        ...state,
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

    case 'SET_EXPORT_CONFIG':
      return {
        ...state,
        lastExportConfig: action.payload
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
  const [searchParams, setSearchParams] = useSearchParams();
  
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

  // URL synchronization
  const syncUrlParams = useCallback(() => {
    if (!enableUrlSync) return;

    const params: FileContextUrlParams = {};
    
    if (state.currentView !== 'fileEditor') params.view = state.currentView;
    if (state.currentTool) params.tool = state.currentTool;
    if (state.selectedFileIds.length > 0) params.fileIds = state.selectedFileIds;
    // Note: selectedPageIds intentionally excluded from URL sync - page selection is transient UI state
    if (state.viewerConfig.zoom !== 1.0) params.zoom = state.viewerConfig.zoom;
    if (state.viewerConfig.currentPage !== 1) params.page = state.viewerConfig.currentPage;

    // Update URL params without causing navigation
    const newParams = new URLSearchParams(searchParams);
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        newParams.set(key, value.join(','));
      } else if (value !== undefined) {
        newParams.set(key, value.toString());
      }
    });

    // Remove empty params
    Object.keys(params).forEach(key => {
      if (!params[key as keyof FileContextUrlParams]) {
        newParams.delete(key);
      }
    });

    setSearchParams(newParams, { replace: true });
  }, [state, searchParams, setSearchParams, enableUrlSync]);

  // Load from URL params on mount
  useEffect(() => {
    if (!enableUrlSync) return;

    const view = searchParams.get('view') as ViewType;
    const tool = searchParams.get('tool') as ToolType;
    const zoom = searchParams.get('zoom');
    const page = searchParams.get('page');

    if (view && view !== state.currentView) {
      dispatch({ type: 'SET_CURRENT_VIEW', payload: view });
    }
    if (tool && tool !== state.currentTool) {
      dispatch({ type: 'SET_CURRENT_TOOL', payload: tool });
    }
    if (zoom || page) {
      dispatch({ 
        type: 'UPDATE_VIEWER_CONFIG', 
        payload: {
          ...(zoom && { zoom: parseFloat(zoom) }),
          ...(page && { currentPage: parseInt(page) })
        }
      });
    }
  }, []);

  // Sync URL when state changes
  useEffect(() => {
    syncUrlParams();
  }, [syncUrlParams]);

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
          await fileStorage.storeFile(file);
        } catch (error) {
          console.error('Failed to store file:', error);
        }
      }
    }
  }, [enablePersistence]);

  const removeFiles = useCallback((fileIds: string[]) => {
    // FULL cleanup for actually removed files (including cache)
    fileIds.forEach(fileId => {
      // Cancel processing and clear caches when file is actually removed
      enhancedPDFProcessingService.cancelProcessing(fileId);
      cleanupFile(fileId);
    });
    
    dispatch({ type: 'REMOVE_FILES', payload: fileIds });
    
    // Remove from IndexedDB
    if (enablePersistence) {
      fileIds.forEach(async (fileId) => {
        try {
          await fileStorage.removeFile(fileId);
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

  const setCurrentView = useCallback((view: ViewType) => {
    // Update view immediately for instant UI response
    dispatch({ type: 'SET_CURRENT_VIEW', payload: view });
    
    // REMOVED: Aggressive cleanup on view switch
    // This was destroying cached processed files and causing re-processing
    // We should only cleanup when files are actually removed or app closes
    
    // Optional: Light memory pressure relief only for very large docs
    if (state.currentView !== view && state.activeFiles.length > 0) {
      // Only hint at garbage collection, don't destroy caches
      if (window.requestIdleCallback && typeof window !== 'undefined' && window.gc) {
        window.requestIdleCallback(() => {
          // Very light cleanup - just GC hint, no cache destruction
          window.gc();
        }, { timeout: 5000 });
      }
    }
  }, [state.currentView, state.activeFiles]);

  const setCurrentTool = useCallback((tool: ToolType) => {
    dispatch({ type: 'SET_CURRENT_TOOL', payload: tool });
  }, []);

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
    // TODO: Implement undo logic
    console.warn('Undo not yet implemented');
  }, []);

  const updateViewerConfig = useCallback((config: Partial<ViewerConfig>) => {
    dispatch({ type: 'UPDATE_VIEWER_CONFIG', payload: config });
  }, []);

  const setExportConfig = useCallback((config: FileContextState['lastExportConfig']) => {
    dispatch({ type: 'SET_EXPORT_CONFIG', payload: config });
  }, []);

  // Utility functions
  const getFileById = useCallback((fileId: string): File | undefined => {
    return state.activeFiles.find(file => file.name === fileId); // Simple ID matching
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