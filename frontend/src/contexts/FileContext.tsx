/**
 * FileContext - Manages PDF files for Stirling PDF multi-tool workflow
 * 
 * Handles file state, memory management, and resource cleanup for large PDFs (up to 100GB+).
 * Users upload PDFs once and chain tools (split → merge → compress → view) without reloading.
 * 
 * Key hooks:
 * - useFileState() - access file state and UI state
 * - useFileActions() - file operations (add/remove/update)  
 * - useToolFileSelection() - for tool components
 * 
 * Memory management handled by FileLifecycleManager (PDF.js cleanup, blob URL revocation).
 */

import React, { useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  FileContextProviderProps,
  FileContextSelectors,
  FileContextStateValue,
  FileContextActionsValue,
  FileContextActions,
  FileId,
  FileRecord
} from '../types/fileContext';

// Import modular components
import { fileContextReducer, initialFileContextState } from './file/FileReducer';
import { createFileSelectors, buildQuickKeySetFromMetadata } from './file/fileSelectors';
import { addFiles, consumeFiles, createFileActions } from './file/fileActions';
import { FileLifecycleManager } from './file/lifecycle';
import { FileStateContext, FileActionsContext } from './file/contexts';
import { IndexedDBProvider, useIndexedDB } from './IndexedDBContext';

const DEBUG = process.env.NODE_ENV === 'development';


// Inner provider component that has access to IndexedDB
function FileContextInner({
  children,
  enableUrlSync = true,
  enablePersistence = true 
}: FileContextProviderProps) {
  const [state, dispatch] = useReducer(fileContextReducer, initialFileContextState);
  
  // IndexedDB context for persistence
  const indexedDB = enablePersistence ? useIndexedDB() : null;

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

  // File operations using unified addFiles helper with persistence
  const addRawFiles = useCallback(async (files: File[]): Promise<File[]> => {
    const addedFilesWithIds = await addFiles('raw', { files }, stateRef, filesRef, dispatch);
    
    // Persist to IndexedDB if enabled - pass existing thumbnail to prevent double generation
    if (indexedDB && enablePersistence && addedFilesWithIds.length > 0) {
      await Promise.all(addedFilesWithIds.map(async ({ file, id, thumbnail }) => {
        try {
          await indexedDB.saveFile(file, id, thumbnail);
        } catch (error) {
          console.error('Failed to persist file to IndexedDB:', file.name, error);
        }
      }));
    }
    
    return addedFilesWithIds.map(({ file }) => file);
  }, [indexedDB, enablePersistence]);

  const addProcessedFiles = useCallback(async (filesWithThumbnails: Array<{ file: File; thumbnail?: string; pageCount?: number }>): Promise<File[]> => {
    const result = await addFiles('processed', { filesWithThumbnails }, stateRef, filesRef, dispatch);
    return result.map(({ file }) => file);
  }, []);

  const addStoredFiles = useCallback(async (filesWithMetadata: Array<{ file: File; originalId: FileId; metadata: any }>): Promise<File[]> => {
    const result = await addFiles('stored', { filesWithMetadata }, stateRef, filesRef, dispatch);
    return result.map(({ file }) => file);
  }, []);

  // Action creators
  const baseActions = useMemo(() => createFileActions(dispatch), []);

  // Helper functions for pinned files
  const consumeFilesWrapper = useCallback(async (inputFileIds: FileId[], outputFiles: File[]): Promise<void> => {
    return consumeFiles(inputFileIds, outputFiles, stateRef, filesRef, dispatch);
  }, []);

  // Helper to find FileId from File object
  const findFileId = useCallback((file: File): FileId | undefined => {
    return Object.keys(stateRef.current.files.byId).find(id => {
      const storedFile = filesRef.current.get(id);
      return storedFile && 
             storedFile.name === file.name && 
             storedFile.size === file.size && 
             storedFile.lastModified === file.lastModified;
    });
  }, []);

  // File-to-ID wrapper functions for pinning
  const pinFileWrapper = useCallback((file: File) => {
    const fileId = findFileId(file);
    if (fileId) {
      baseActions.pinFile(fileId);
    } else {
      console.warn('File not found for pinning:', file.name);
    }
  }, [baseActions, findFileId]);

  const unpinFileWrapper = useCallback((file: File) => {
    const fileId = findFileId(file);
    if (fileId) {
      baseActions.unpinFile(fileId);
    } else {
      console.warn('File not found for unpinning:', file.name);
    }
  }, [baseActions, findFileId]);

  // Complete actions object
  const actions = useMemo<FileContextActions>(() => ({
    ...baseActions,
    addFiles: addRawFiles,
    addProcessedFiles,
    addStoredFiles, 
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
    updateFileRecord: (fileId: FileId, updates: Partial<FileRecord>) => 
      lifecycleManager.updateFileRecord(fileId, updates, stateRef),
    clearAllFiles: async () => {
      lifecycleManager.cleanupAllFiles();
      filesRef.current.clear();
      dispatch({ type: 'RESET_CONTEXT' });
      
      // Clear IndexedDB if enabled
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
    setHasUnsavedChanges,
    trackBlobUrl: lifecycleManager.trackBlobUrl,
    trackPdfDocument: lifecycleManager.trackPdfDocument,
    cleanupFile: (fileId: string) => lifecycleManager.cleanupFile(fileId, stateRef),
    scheduleCleanup: (fileId: string, delay?: number) => 
      lifecycleManager.scheduleCleanup(fileId, delay, stateRef)
  }), [
    baseActions, 
    addRawFiles, 
    addProcessedFiles, 
    addStoredFiles, 
    lifecycleManager,
    setHasUnsavedChanges,
    consumeFilesWrapper,
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

  // Load files from persistence on mount
  useEffect(() => {
    if (!enablePersistence || !indexedDB) return;
    
    const loadFromPersistence = async () => {
      try {
        // Load metadata to populate file list (actual File objects loaded on-demand)
        const metadata = await indexedDB.loadAllMetadata();
        if (metadata.length === 0) {
          if (DEBUG) console.log('📄 No files found in persistence');
          return;
        }
        
        if (DEBUG) {
          console.log(`📄 Loading ${metadata.length} files from persistence`);
        }
        
        // Create FileRecords from metadata - File objects loaded when needed
        const fileRecords = metadata.map(meta => ({
          id: meta.id,
          name: meta.name,
          size: meta.size,
          type: meta.type,
          lastModified: meta.lastModified,
          thumbnailUrl: meta.thumbnail,
          isPinned: false,
          createdAt: Date.now()
        }));
        
        // Add to state so file manager can show them
        dispatch({ 
          type: 'ADD_FILES', 
          payload: { fileRecords } 
        });
        
      } catch (error) {
        console.error('Failed to load files from persistence:', error);
      }
    };
    
    loadFromPersistence();
  }, [enablePersistence, indexedDB]); // Only run when these change

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
  useFileRecord,
  useAllFiles,
  useSelectedFiles,
  // Primary API hooks for tools
  useFileContext,
  useToolFileSelection,
  useProcessedFiles
} from './file/fileHooks';