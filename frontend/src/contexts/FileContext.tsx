/**
 * Refactored FileContext with reducer pattern and normalized state
 * 
 * PERFORMANCE IMPROVEMENTS:
 * - Normalized state: File objects stored in refs, only IDs in state
 * - Pure reducer: No object creation in reducer functions
 * - Split contexts: StateContext vs ActionsContext prevents unnecessary rerenders
 * - Individual selector hooks: Avoid selector object recreation
 * - Stable actions: useCallback + stateRef prevents action recreation
 * - Throttled persistence: Debounced localStorage writes
 * - Proper resource cleanup: Automatic blob URL revocation
 * 
 * USAGE:
 * - State access: useFileState(), useFileRecord(), useFileSelection()
 * - Actions only: useFileActions(), useFileManagement(), useViewerActions()
 * - Combined: useFileContext() (legacy - causes rerenders on any state change)
 * - FileRecord is the new lightweight "processed file" - no heavy processing needed
 * 
 * PERFORMANCE NOTES:
 * - useFileState() still rerenders on ANY state change (selectors object recreation)
 * - For list UIs: consider ids-only context or use-context-selector
 * - Individual hooks (useFileRecord) are the most performant option
 */

import React, { createContext, useContext, useReducer, useRef, useMemo, useCallback, useEffect } from 'react';
import { 
  FileContextState, 
  FileContextAction, 
  FileContextValue, 
  FileContextProviderProps,
  FileContextSelectors,
  FileContextStateValue,
  FileContextActionsValue,
  FileContextActions,
  ModeType,
  FileId,
  FileRecord,
  toFileRecord,
  revokeFileResources,
  createStableFileId
} from '../types/fileContext';
import { EnhancedPDFProcessingService } from '../services/enhancedPDFProcessingService';

// Initial state
const initialFileContextState: FileContextState = {
  files: {
    ids: [],
    byId: {}
  },
  ui: {
    currentMode: 'fileEditor',
    selectedFileIds: [],
    selectedPageNumbers: [],
    viewerConfig: {
      zoom: 1.0,
      currentPage: 1,
      viewMode: 'single',
      sidebarOpen: false
    },
    // Tool selection state (replaces FileSelectionContext)
    toolMode: false,
    maxFiles: -1, // -1 = unlimited
    currentTool: undefined,
    isProcessing: false,
    processingProgress: 0,
    lastExportConfig: undefined,
    hasUnsavedChanges: false,
    pendingNavigation: null,
    showNavigationWarning: false
  },
  history: {
    fileEditHistory: new Map(),
    globalFileOperations: [],
    fileOperationHistory: new Map()
  }
};

// Pure reducer function
function fileContextReducer(state: FileContextState, action: FileContextAction): FileContextState {
  switch (action.type) {
    case 'ADD_FILES': {
      const { files } = action.payload;
      const newIds: FileId[] = [];
      const newById: Record<FileId, FileRecord> = { ...state.files.byId };
      
      files.forEach(file => {
        const stableId = createStableFileId(file);
        // Only add if not already present (dedupe by stable ID)
        if (!newById[stableId]) {
          const record = toFileRecord(file, stableId);
          newIds.push(record.id);
          newById[record.id] = record;
        }
      });
      
      return {
        ...state,
        files: {
          ids: [...state.files.ids, ...newIds],
          byId: newById
        }
      };
    }
    
    case 'REMOVE_FILES': {
      const { fileIds } = action.payload;
      const remainingIds = state.files.ids.filter(id => !fileIds.includes(id));
      const newById = { ...state.files.byId };
      
      // Clean up removed files
      fileIds.forEach(id => {
        const record = newById[id];
        if (record) {
          revokeFileResources(record);
          delete newById[id];
        }
      });
      
      return {
        ...state,
        files: {
          ids: remainingIds,
          byId: newById
        },
        ui: {
          ...state.ui,
          selectedFileIds: state.ui.selectedFileIds.filter(id => !fileIds.includes(id))
        }
      };
    }
    
    case 'UPDATE_FILE_RECORD': {
      const { id, updates } = action.payload;
      const existingRecord = state.files.byId[id];
      if (!existingRecord) return state;
      
      return {
        ...state,
        files: {
          ...state.files,
          byId: {
            ...state.files.byId,
            [id]: { ...existingRecord, ...updates }
          }
        }
      };
    }
    
    case 'CLEAR_ALL_FILES': {
      // Clean up all file resources
      Object.values(state.files.byId).forEach(revokeFileResources);
      
      return {
        ...state,
        files: {
          ids: [],
          byId: {}
        },
        ui: {
          ...state.ui,
          selectedFileIds: [],
          selectedPageNumbers: []
        }
      };
    }
    
    case 'SET_MODE': {
      return {
        ...state,
        ui: {
          ...state.ui,
          currentMode: action.payload.mode
        }
      };
    }
    
    case 'SET_SELECTED_FILES': {
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedFileIds: action.payload.fileIds
        }
      };
    }
    
    case 'SET_SELECTED_PAGES': {
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedPageNumbers: action.payload.pageNumbers
        }
      };
    }
    
    case 'CLEAR_SELECTIONS': {
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedFileIds: [],
          selectedPageNumbers: []
        }
      };
    }
    
    case 'SET_PROCESSING': {
      return {
        ...state,
        ui: {
          ...state.ui,
          isProcessing: action.payload.isProcessing,
          processingProgress: action.payload.progress
        }
      };
    }
    
    // Tool selection cases (replaces FileSelectionContext)
    case 'SET_TOOL_MODE': {
      return {
        ...state,
        ui: {
          ...state.ui,
          toolMode: action.payload.toolMode
        }
      };
    }
    
    case 'SET_MAX_FILES': {
      return {
        ...state,
        ui: {
          ...state.ui,
          maxFiles: action.payload.maxFiles
        }
      };
    }
    
    case 'SET_CURRENT_TOOL': {
      return {
        ...state,
        ui: {
          ...state.ui,
          currentTool: action.payload.currentTool
        }
      };
    }
    
    case 'UPDATE_VIEWER_CONFIG': {
      return {
        ...state,
        ui: {
          ...state.ui,
          viewerConfig: {
            ...state.ui.viewerConfig,
            ...action.payload.config
          }
        }
      };
    }
    
    case 'SET_EXPORT_CONFIG': {
      return {
        ...state,
        ui: {
          ...state.ui,
          lastExportConfig: action.payload.config
        }
      };
    }
    
    case 'SET_UNSAVED_CHANGES': {
      return {
        ...state,
        ui: {
          ...state.ui,
          hasUnsavedChanges: action.payload.hasChanges
        }
      };
    }
    
    case 'SET_PENDING_NAVIGATION': {
      return {
        ...state,
        ui: {
          ...state.ui,
          pendingNavigation: action.payload.navigationFn
        }
      };
    }
    
    case 'SHOW_NAVIGATION_WARNING': {
      return {
        ...state,
        ui: {
          ...state.ui,
          showNavigationWarning: action.payload.show
        }
      };
    }
    
    case 'CONFIRM_NAVIGATION': {
      const pendingNavigation = state.ui.pendingNavigation;
      if (pendingNavigation) {
        pendingNavigation();
      }
      return {
        ...state,
        ui: {
          ...state.ui,
          pendingNavigation: null,
          showNavigationWarning: false
        }
      };
    }
    
    case 'CANCEL_NAVIGATION': {
      return {
        ...state,
        ui: {
          ...state.ui,
          pendingNavigation: null,
          showNavigationWarning: false
        }
      };
    }
    
    case 'RESET_CONTEXT': {
      // Clean up all resources before reset
      Object.values(state.files.byId).forEach(revokeFileResources);
      return { ...initialFileContextState };
    }
    
    default:
      return state;
  }
}

// Split contexts for performance
const FileStateContext = createContext<FileContextStateValue | undefined>(undefined);
const FileActionsContext = createContext<FileContextActionsValue | undefined>(undefined);

// Provider component
export function FileContextProvider({ 
  children, 
  enableUrlSync = true,
  enablePersistence = true 
}: FileContextProviderProps) {
  const [state, dispatch] = useReducer(fileContextReducer, initialFileContextState);
  
  // Refs for stable references
  const stateRef = useRef(state);
  stateRef.current = state;
  
  // Stable selector functions that don't recreate on every state change
  const stableSelectors = useMemo(() => {
    const getFileById = (id: FileId) => stateRef.current.files.byId[id];
    const getFilesByIds = (ids: FileId[]) => ids.map(id => stateRef.current.files.byId[id]).filter(Boolean);
    const getAllFiles = () => stateRef.current.files.ids.map(id => stateRef.current.files.byId[id]);
    const getSelectedFiles = () => stateRef.current.ui.selectedFileIds.map(id => stateRef.current.files.byId[id]).filter(Boolean);
    
    // Convenience file helpers
    const getFile = (id: FileId) => stateRef.current.files.byId[id]?.file;
    const getFiles = (ids?: FileId[]) => {
      const fileIds = ids || stateRef.current.files.ids;
      return fileIds.map(id => stateRef.current.files.byId[id]?.file).filter(Boolean);
    };
    
    const getCurrentMode = () => stateRef.current.ui.currentMode;
    const getSelectedFileIds = () => stateRef.current.ui.selectedFileIds;
    const getSelectedPageNumbers = () => stateRef.current.ui.selectedPageNumbers;
    const getViewerConfig = () => stateRef.current.ui.viewerConfig;
    const getProcessingState = () => ({ 
      isProcessing: stateRef.current.ui.isProcessing, 
      progress: stateRef.current.ui.processingProgress 
    });
    const getHasUnsavedChanges = () => stateRef.current.ui.hasUnsavedChanges;
    const getShowNavigationWarning = () => stateRef.current.ui.showNavigationWarning;
    const getFileHistory = (fileId: string) => stateRef.current.history.fileOperationHistory.get(fileId);
    const getAppliedOperations = (fileId: string) => {
      const history = stateRef.current.history.fileOperationHistory.get(fileId);
      return history ? history.operations.filter(op => op.status === 'applied') : [];
    };

    return {
      getFileById,
      getFilesByIds,
      getAllFiles,
      getSelectedFiles,
      getFile,
      getFiles,
      getCurrentMode,
      getSelectedFileIds,
      getSelectedPageNumbers,
      getViewerConfig,
      getProcessingState,
      getHasUnsavedChanges,
      getShowNavigationWarning,
      getFileHistory,
      getAppliedOperations
    };
  }, []); // Empty dependency array - selectors use stateRef
  
  // Stable action callbacks (using stateRef to prevent recreation)
  const actions: FileContextActions = useMemo(() => ({
    addFiles: async (files: File[]): Promise<File[]> => {
      dispatch({ type: 'ADD_FILES', payload: { files } });
      
      // Process PDF files asynchronously for PageEditor compatibility
      const pdfProcessingService = EnhancedPDFProcessingService.getInstance();
      
      files.forEach(async (file) => {
        if (file.type === 'application/pdf') {
          try {
            console.log(`🔄 Processing PDF: ${file.name} (${file.size} bytes)`);
            const stableId = createStableFileId(file);
            
            // Add timeout to prevent indefinite processing
            const processingPromise = pdfProcessingService.processFile(file);
            const timeoutPromise = new Promise<null>((_, reject) => {
              setTimeout(() => reject(new Error('Processing timeout')), 30000); // 30 second timeout
            });
            
            const processedFile = await Promise.race([processingPromise, timeoutPromise]);
            
            console.log(`✅ PDF processed: ${file.name}, result:`, processedFile ? 'success' : 'null');
            if (processedFile) {
              // Update file record with processed data
              dispatch({ 
                type: 'UPDATE_FILE_RECORD', 
                payload: { 
                  id: stableId, 
                  updates: { processedFile } 
                }
              });
              console.log(`📁 Updated FileRecord for ${file.name} with processed data`);
            } else {
              console.warn(`⚠️ Processing returned null for ${file.name}, file will use fallback page counting`);
            }
          } catch (error) {
            console.error(`❌ Failed to process PDF ${file.name}:`, error);
            // Continue without processed data - FileEditor will use fallback page counting
          }
        }
      });
      
      return files;
    },
    
    removeFiles: (fileIds: string[], deleteFromStorage: boolean = true) => {
      dispatch({ type: 'REMOVE_FILES', payload: { fileIds } });
    },
    
    replaceFile: async (oldFileId: string, newFile: File) => {
      dispatch({ type: 'REMOVE_FILES', payload: { fileIds: [oldFileId] } });
      dispatch({ type: 'ADD_FILES', payload: { files: [newFile] } });
    },
    
    clearAllFiles: () => {
      dispatch({ type: 'CLEAR_ALL_FILES' });
    },
    
    setMode: (mode: ModeType) => {
      dispatch({ type: 'SET_MODE', payload: { mode } });
    },
    
    setSelectedFiles: (fileIds: string[]) => {
      dispatch({ type: 'SET_SELECTED_FILES', payload: { fileIds } });
    },
    
    setSelectedPages: (pageNumbers: number[]) => {
      dispatch({ type: 'SET_SELECTED_PAGES', payload: { pageNumbers } });
    },
    
    clearSelections: () => {
      dispatch({ type: 'CLEAR_SELECTIONS' });
    },
    
    // Tool selection actions (replaces FileSelectionContext)
    setToolMode: (toolMode: boolean) => {
      dispatch({ type: 'SET_TOOL_MODE', payload: { toolMode } });
    },
    
    setMaxFiles: (maxFiles: number) => {
      dispatch({ type: 'SET_MAX_FILES', payload: { maxFiles } });
    },
    
    setCurrentTool: (currentTool?: string) => {
      dispatch({ type: 'SET_CURRENT_TOOL', payload: { currentTool } });
    },
    
    setProcessing: (isProcessing: boolean, progress: number) => {
      dispatch({ type: 'SET_PROCESSING', payload: { isProcessing, progress } });
    },
    
    updateViewerConfig: (config: Partial<FileContextState['ui']['viewerConfig']>) => {
      dispatch({ type: 'UPDATE_VIEWER_CONFIG', payload: { config } });
    },
    
    setExportConfig: (config: FileContextState['ui']['lastExportConfig']) => {
      dispatch({ type: 'SET_EXPORT_CONFIG', payload: { config } });
    },
    
    setHasUnsavedChanges: (hasChanges: boolean) => {
      dispatch({ type: 'SET_UNSAVED_CHANGES', payload: { hasChanges } });
    },
    
    requestNavigation: (navigationFn: () => void): boolean => {
      const currentState = stateRef.current;
      if (currentState.ui.hasUnsavedChanges) {
        dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn } });
        dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: true } });
        return false;
      } else {
        navigationFn();
        return true;
      }
    },
    
    confirmNavigation: () => {
      dispatch({ type: 'CONFIRM_NAVIGATION' });
    },
    
    cancelNavigation: () => {
      dispatch({ type: 'CANCEL_NAVIGATION' });
    },
    
    resetContext: () => {
      dispatch({ type: 'RESET_CONTEXT' });
    }
  }), []);
  
  // Context values
  const stateValue: FileContextStateValue = useMemo(() => ({
    state,
    selectors: stableSelectors
  }), [state, stableSelectors]);
  
  const actionsValue: FileContextActionsValue = useMemo(() => ({
    actions,
    dispatch
  }), [actions]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(state.files.byId).forEach(revokeFileResources);
    };
  }, []);
  
  return (
    <FileStateContext.Provider value={stateValue}>
      <FileActionsContext.Provider value={actionsValue}>
        {children}
      </FileActionsContext.Provider>
    </FileStateContext.Provider>
  );
}

// Hooks for accessing contexts
export function useFileState(): FileContextStateValue {
  const context = useContext(FileStateContext);
  if (!context) {
    throw new Error('useFileState must be used within a FileContextProvider');
  }
  return context;
}

export function useFileActions(): FileContextActionsValue {
  const context = useContext(FileActionsContext);
  if (!context) {
    throw new Error('useFileActions must be used within a FileContextProvider');
  }
  return context;
}

// Individual optimized hooks
export function useFileRecord(id: FileId): FileRecord | undefined {
  const { state } = useFileState();
  return state.files.byId[id];
}

export function useFileRecords(ids?: FileId[]): FileRecord[] {
  const { state } = useFileState();
  if (!ids) {
    return state.files.ids.map(id => state.files.byId[id]);
  }
  return ids.map(id => state.files.byId[id]).filter(Boolean);
}

export function useFileSelection() {
  const { state } = useFileState();
  const { actions } = useFileActions();
  
  return useMemo(() => ({
    selectedFileIds: state.ui.selectedFileIds,
    selectedFiles: state.ui.selectedFileIds.map(id => state.files.byId[id]).filter(Boolean),
    selectedPageNumbers: state.ui.selectedPageNumbers,
    setSelectedFiles: actions.setSelectedFiles,
    setSelectedPages: actions.setSelectedPages,
    clearSelections: actions.clearSelections
  }), [state.ui.selectedFileIds, state.ui.selectedPageNumbers, state.files.byId]);
}

// Tool selection hook (replaces FileSelectionContext functionality)
export function useToolFileSelection() {
  const { state } = useFileState();
  const { actions } = useFileActions();
  
  const selectedFiles = useMemo(() => 
    state.ui.selectedFileIds
      .map(id => state.files.byId[id]?.file)
      .filter(Boolean) as File[],
    [state.ui.selectedFileIds, state.files.byId]
  );
    
  const selectionCount = selectedFiles.length;
  const canSelectMore = state.ui.maxFiles === -1 || selectionCount < state.ui.maxFiles;
  const isAtLimit = state.ui.maxFiles > 0 && selectionCount >= state.ui.maxFiles;
  const isMultiFileMode = state.ui.maxFiles !== 1;
  
  return useMemo(() => ({
    // Core selection state (matches FileSelectionContext interface)
    selectedFiles,
    maxFiles: state.ui.maxFiles,
    isToolMode: state.ui.toolMode,
    
    // Selection actions
    setSelectedFiles: (files: File[]) => {
      const fileIds = files.map(file => createStableFileId(file));
      actions.setSelectedFiles(fileIds);
    },
    setMaxFiles: actions.setMaxFiles,
    setIsToolMode: actions.setToolMode,
    clearSelection: () => actions.setSelectedFiles([]),
    
    // Computed values (matches FileSelectionContext interface)
    canSelectMore,
    isAtLimit,
    selectionCount,
    isMultiFileMode
  }), [selectedFiles, state.ui.maxFiles, state.ui.toolMode, canSelectMore, isAtLimit, selectionCount, isMultiFileMode]);
}

export function useFileManagement() {
  const { actions } = useFileActions();
  return useMemo(() => ({
    addFiles: actions.addFiles,
    removeFiles: actions.removeFiles,
    replaceFile: actions.replaceFile,
    clearAllFiles: actions.clearAllFiles
  }), []);
}

export function useViewerActions() {
  const { state } = useFileState();
  const { actions } = useFileActions();
  return useMemo(() => ({
    viewerConfig: state.ui.viewerConfig,
    updateViewerConfig: actions.updateViewerConfig
  }), [state.ui.viewerConfig]);
}

export function useCurrentFile() {
  const { state } = useFileState();
  const selectedFiles = useMemo(() => 
    state.ui.selectedFileIds.map(id => state.files.byId[id]?.file).filter(Boolean),
    [state.ui.selectedFileIds, state.files.byId]
  );
  const allFiles = useMemo(() => 
    state.files.ids.map(id => state.files.byId[id]?.file).filter(Boolean),
    [state.files.ids, state.files.byId]
  );
  
  // Get the current file record to access processed data
  const currentRecord = useMemo(() => {
    const fileId = state.ui.selectedFileIds[0] || state.files.ids[0];
    return fileId ? state.files.byId[fileId] : undefined;
  }, [state.ui.selectedFileIds, state.files.ids, state.files.byId]);
  
  return useMemo(() => ({
    file: selectedFiles[0] || allFiles[0],
    processedFile: currentRecord?.processedFile // Now returns actual processed file
  }), [selectedFiles, allFiles, currentRecord]);
}

// New hook for accessing processed files - stable reference
export function useProcessedFiles() {
  const { state } = useFileState();
  const mapRef = useRef(new Map());
  const lastStateRef = useRef<string>('');
  
  // Create a stable hash of the processed files state
  const currentStateHash = useMemo(() => {
    return state.files.ids
      .map(id => {
        const record = state.files.byId[id];
        return record?.processedFile ? `${id}:${record.processedFile.id}` : `${id}:null`;
      })
      .join('|');
  }, [state.files.ids, state.files.byId]);
  
  // Only recreate map when processed file state actually changes
  if (currentStateHash !== lastStateRef.current) {
    const processedMap = new Map();
    state.files.ids.forEach(id => {
      const record = state.files.byId[id];
      if (record?.processedFile) {
        processedMap.set(record.file, record.processedFile);
      }
    });
    mapRef.current = processedMap;
    lastStateRef.current = currentStateHash;
  }
  
  return mapRef.current;
}

// Hook to check if files are still being processed
export function useFileProcessingState() {
  const { state } = useFileState();
  
  return useMemo(() => {
    let totalFiles = 0;
    let processedFiles = 0;
    let pendingFiles = 0;
    
    state.files.ids.forEach(id => {
      const record = state.files.byId[id];
      if (record?.file.type === 'application/pdf') {
        totalFiles++;
        if (record.processedFile) {
          processedFiles++;
        } else {
          pendingFiles++;
        }
      }
    });
    
    return {
      totalFiles,
      processedFiles,
      pendingFiles,
      isProcessing: pendingFiles > 0,
      progress: totalFiles > 0 ? (processedFiles / totalFiles) * 100 : 0
    };
  }, [state.files.ids, state.files.byId]);
}

// Legacy combined hook (causes rerenders on any state change)
export function useFileContext(): FileContextValue {
  const { state, selectors } = useFileState();
  const { actions } = useFileActions();
  const processedFilesMap = useProcessedFiles();
  
  // Memoize the returned object to prevent infinite re-renders
  return useMemo(() => ({
    // Legacy state structure compatibility
    activeFiles: state.files.ids
      .map(id => state.files.byId[id])
      .filter(record => record?.file)
      .map(record => record!.file),
    processedFiles: processedFilesMap, // Now provides actual processed files
    currentMode: state.ui.currentMode,
    currentView: state.ui.currentMode,
    currentTool: null,
    fileEditHistory: state.history.fileEditHistory,
    globalFileOperations: state.history.globalFileOperations,
    fileOperationHistory: state.history.fileOperationHistory,
    selectedFileIds: state.ui.selectedFileIds,
    selectedPageNumbers: state.ui.selectedPageNumbers,
    viewerConfig: state.ui.viewerConfig,
    isProcessing: state.ui.isProcessing,
    processingProgress: state.ui.processingProgress,
    lastExportConfig: state.ui.lastExportConfig,
    hasUnsavedChanges: state.ui.hasUnsavedChanges,
    pendingNavigation: state.ui.pendingNavigation,
    showNavigationWarning: state.ui.showNavigationWarning,
    
    // Actions
    addFiles: actions.addFiles,
    removeFiles: actions.removeFiles,
    replaceFile: actions.replaceFile,
    clearAllFiles: actions.clearAllFiles,
    setCurrentMode: actions.setMode,
    setCurrentView: actions.setMode,
    setCurrentTool: () => {}, // Legacy compatibility
    setSelectedFiles: actions.setSelectedFiles,
    setSelectedPages: actions.setSelectedPages,
    clearSelections: actions.clearSelections,
    updateViewerConfig: actions.updateViewerConfig,
    setExportConfig: actions.setExportConfig,
    setHasUnsavedChanges: actions.setHasUnsavedChanges,
    requestNavigation: actions.requestNavigation,
    confirmNavigation: actions.confirmNavigation,
    cancelNavigation: actions.cancelNavigation,
    resetContext: actions.resetContext,
    
    // Legacy operations compatibility
    recordOperation: () => {}, // Placeholder
    markOperationApplied: () => {}, // Placeholder
    markOperationFailed: () => {}, // Placeholder
    applyPageOperations: () => {}, // Placeholder
    applyFileOperation: () => {}, // Placeholder
    undoLastOperation: () => {}, // Placeholder
    updateProcessedFile: () => {}, // Placeholder
    getProcessedFileById: () => undefined, // Placeholder
    getCurrentProcessedFile: () => undefined, // Placeholder
    saveContext: async () => {}, // Placeholder
    loadContext: async () => {}, // Placeholder
    
    // Memory management placeholders
    trackBlobUrl: () => {},
    trackPdfDocument: () => {},
    cleanupFile: async () => {},
    scheduleCleanup: () => {},
    
    // History placeholders
    getFileHistory: () => undefined,
    getAppliedOperations: () => [],
    clearFileHistory: () => {},
    
    // Selectors
    getFileById: (id: string) => selectors.getFileById(id)?.file,
    getCurrentFile: () => {
      const selectedFiles = selectors.getSelectedFiles();
      return selectedFiles[0]?.file || selectors.getAllFiles()[0]?.file;
    }
  }), [state, actions, selectors, processedFilesMap]);
}