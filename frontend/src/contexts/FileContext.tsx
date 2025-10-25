/**
 * FileContext - Manages PDF files for Stirling PDF multi-tool workflow
 *
 * Handles file state, memory management, and resource cleanup for large PDFs (up to 100GB+).
 * Users upload PDFs once and chain tools (split → merge → compress → view) without reloading.
 *
 * Key hooks:
 * - useFileState() - access file state and UI state
 * - useFileActions() - file operations (add/remove/update)
 * - useFileSelection() - for file selection state and actions
 *
 * Memory management handled by FileLifecycleManager (PDF.js cleanup, blob URL revocation).
 */

import { useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  FileContextProviderProps,
  FileContextSelectors,
  FileContextStateValue,
  FileContextActionsValue,
  FileContextActions,
  FileId,
  StirlingFileStub,
  StirlingFile,
} from '../types/fileContext';

// Import modular components
import { fileContextReducer, initialFileContextState } from './file/FileReducer';
import { createFileSelectors } from './file/fileSelectors';
import { addFiles, addStirlingFileStubs, consumeFiles, undoConsumeFiles, createFileActions } from './file/fileActions';
import { FileLifecycleManager } from './file/lifecycle';
import { FileStateContext, FileActionsContext } from './file/contexts';
import { IndexedDBProvider, useIndexedDB } from './IndexedDBContext';

const DEBUG = process.env.NODE_ENV === 'development';


// Inner provider component that has access to IndexedDB
function FileContextInner({
  children,
  enablePersistence = true
}: FileContextProviderProps) {
  const [state, dispatch] = useReducer(fileContextReducer, initialFileContextState);

  // IndexedDB context for persistence - always call the hook
  const indexedDBResult = useIndexedDB();
  const indexedDB = enablePersistence ? indexedDBResult : null;

  // File ref map - stores File objects outside React state
  const filesRef = useRef<Map<FileId, File>>(new Map());

  // Stable state reference for selectors
  const stateRef = useRef(state);
  stateRef.current = state;

  // Create lifecycle manager
  const lifecycleManagerRef = useRef<FileLifecycleManager | null>(null);
  if (!lifecycleManagerRef.current) {
    lifecycleManagerRef.current = new FileLifecycleManager(filesRef, dispatch);
  }
  const lifecycleManager = lifecycleManagerRef.current;

  // Create stable selectors (memoized once to avoid re-renders)
  const selectors = useMemo<FileContextSelectors>(() =>
    createFileSelectors(stateRef, filesRef),
    [] // Empty deps - selectors are stable
  );

  // Navigation management removed - moved to NavigationContext

  // Navigation guard system functions
  const setHasUnsavedChanges = useCallback((hasChanges: boolean) => {
    dispatch({ type: 'SET_UNSAVED_CHANGES', payload: { hasChanges } });
  }, []);

  const selectFiles = (stirlingFiles: StirlingFile[]) => {
    const currentSelection = stateRef.current.ui.selectedFileIds;
    const newFileIds = stirlingFiles.map(stirlingFile => stirlingFile.fileId);
    dispatch({ type: 'SET_SELECTED_FILES', payload: { fileIds: [...currentSelection, ...newFileIds] } });
  };

  // File operations using unified addFiles helper with persistence
  const addRawFiles = useCallback(async (files: File[], options?: { insertAfterPageId?: string; selectFiles?: boolean; skipAutoUnzip?: boolean }): Promise<StirlingFile[]> => {
    const stirlingFiles = await addFiles(
      {
        files,
        ...options,
        // For direct file uploads: ALWAYS unzip (except HTML ZIPs)
        // skipAutoUnzip bypasses preference checks - HTML detection still applies
        skipAutoUnzip: true
      },
      stateRef,
      filesRef,
      dispatch,
      lifecycleManager,
      enablePersistence
    );

    // Auto-select the newly added files if requested
    if (options?.selectFiles && stirlingFiles.length > 0) {
      selectFiles(stirlingFiles);
    }

    return stirlingFiles;
  }, [enablePersistence]);

  const addStirlingFileStubsAction = useCallback(async (stirlingFileStubs: StirlingFileStub[], options?: { insertAfterPageId?: string; selectFiles?: boolean }): Promise<StirlingFile[]> => {
    // StirlingFileStubs preserve all metadata - perfect for FileManager use case!
    const result = await addStirlingFileStubs(stirlingFileStubs, options, stateRef, filesRef, dispatch, lifecycleManager);

    // Auto-select the newly added files if requested
    if (options?.selectFiles && result.length > 0) {
      selectFiles(result);
    }

    return result;
  }, []);


  // Action creators
  const baseActions = useMemo(() => createFileActions(dispatch), []);

  // Helper functions for pinned files
  const consumeFilesWrapper = useCallback(async (inputFileIds: FileId[], outputStirlingFiles: StirlingFile[], outputStirlingFileStubs: StirlingFileStub[]): Promise<FileId[]> => {
    return consumeFiles(inputFileIds, outputStirlingFiles, outputStirlingFileStubs, filesRef, dispatch);
  }, []);

  const undoConsumeFilesWrapper = useCallback(async (inputFiles: File[], inputStirlingFileStubs: StirlingFileStub[], outputFileIds: FileId[]): Promise<void> => {
    return undoConsumeFiles(inputFiles, inputStirlingFileStubs, outputFileIds, filesRef, dispatch, indexedDB);
  }, [indexedDB]);

  // File pinning functions - use StirlingFile directly
  const pinFileWrapper = useCallback((file: StirlingFile) => {
    baseActions.pinFile(file.fileId);
  }, [baseActions]);

  const unpinFileWrapper = useCallback((file: StirlingFile) => {
    baseActions.unpinFile(file.fileId);
  }, [baseActions]);

  // Complete actions object
  const actions = useMemo<FileContextActions>(() => ({
    ...baseActions,
    addFiles: addRawFiles,
    addStirlingFileStubs: addStirlingFileStubsAction,
    removeFiles: async (fileIds: FileId[], deleteFromStorage?: boolean) => {
      // Remove from memory and cleanup resources
      lifecycleManager.removeFiles(fileIds, stateRef);

      // Remove from IndexedDB if enabled
      if (indexedDB && enablePersistence && deleteFromStorage !== false) {
        try {
          await indexedDB.deleteMultiple(fileIds);
        } catch (error) {
          console.error('Failed to delete files from IndexedDB:', error);
        }
      }
    },
    updateStirlingFileStub: (fileId: FileId, updates: Partial<StirlingFileStub>) =>
      lifecycleManager.updateStirlingFileStub(fileId, updates, stateRef),
    reorderFiles: (orderedFileIds: FileId[]) => {
      dispatch({ type: 'REORDER_FILES', payload: { orderedFileIds } });
    },
    clearAllFiles: async () => {
      lifecycleManager.cleanupAllFiles();
      filesRef.current.clear();
      dispatch({ type: 'RESET_CONTEXT' });

      // Don't clear IndexedDB automatically - only clear in-memory state
      // IndexedDB should only be cleared when explicitly requested by user
    },
    clearAllData: async () => {
      // First clear all files from memory
      lifecycleManager.cleanupAllFiles();
      filesRef.current.clear();
      dispatch({ type: 'RESET_CONTEXT' });

      // Then clear IndexedDB storage
      if (indexedDB && enablePersistence) {
        try {
          await indexedDB.clearAll();
        } catch (error) {
          console.error('Failed to clear IndexedDB:', error);
        }
      }
    },
    // Pinned files functionality with File object wrappers
    pinFile: pinFileWrapper,
    unpinFile: unpinFileWrapper,
    consumeFiles: consumeFilesWrapper,
    undoConsumeFiles: undoConsumeFilesWrapper,
    setHasUnsavedChanges,
    trackBlobUrl: lifecycleManager.trackBlobUrl,
    cleanupFile: (fileId: FileId) => lifecycleManager.cleanupFile(fileId, stateRef),
    scheduleCleanup: (fileId: FileId, delay?: number) =>
      lifecycleManager.scheduleCleanup(fileId, delay, stateRef)
  }), [
    baseActions,
    addRawFiles,
    addStirlingFileStubsAction,
    lifecycleManager,
    setHasUnsavedChanges,
    consumeFilesWrapper,
    undoConsumeFilesWrapper,
    pinFileWrapper,
    unpinFileWrapper,
    indexedDB,
    enablePersistence
  ]);

  // Split context values to minimize re-renders
  const stateValue = useMemo<FileContextStateValue>(() => ({
    state,
    selectors
  }), [state, selectors]);

  const actionsValue = useMemo<FileContextActionsValue>(() => ({
    actions,
    dispatch
  }), [actions]);

  // Persistence loading disabled - files only loaded on explicit user action
  // useEffect(() => {
  //   if (!enablePersistence || !indexedDB) return;
  //   const loadFromPersistence = async () => { /* loading logic removed */ };
  //   loadFromPersistence();
  // }, [enablePersistence, indexedDB]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (DEBUG) console.log('FileContext unmounting - cleaning up all resources');
      lifecycleManager.destroy();
    };
  }, [lifecycleManager]);

  return (
    <FileStateContext.Provider value={stateValue}>
      <FileActionsContext.Provider value={actionsValue}>
        {children}
      </FileActionsContext.Provider>
    </FileStateContext.Provider>
  );
}

// Outer provider component that wraps with IndexedDBProvider
export function FileContextProvider({
  children,
  enableUrlSync = true,
  enablePersistence = true
}: FileContextProviderProps) {
  if (enablePersistence) {
    return (
      <IndexedDBProvider>
        <FileContextInner
          enableUrlSync={enableUrlSync}
          enablePersistence={enablePersistence}
        >
          {children}
        </FileContextInner>
      </IndexedDBProvider>
    );
  } else {
    return (
      <FileContextInner
        enableUrlSync={enableUrlSync}
        enablePersistence={enablePersistence}
      >
        {children}
      </FileContextInner>
    );
  }
}

// Export all hooks from the fileHooks module
export {
  useFileState,
  useFileActions,
  useCurrentFile,
  useFileSelection,
  useFileManagement,
  useFileUI,
  useStirlingFileStub,
  useAllFiles,
  useSelectedFiles,
  // Primary API hooks for tools
  useFileContext
} from './file/fileHooks';
