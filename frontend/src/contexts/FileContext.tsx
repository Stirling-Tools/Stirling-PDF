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
import { createFileSelectors } from './file/fileSelectors';
import { addFiles, consumeFiles, createFileActions } from './file/fileActions';
import { FileLifecycleManager } from './file/lifecycle';
import { FileStateContext, FileActionsContext } from './file/contexts';

const DEBUG = process.env.NODE_ENV === 'development';

// Provider component
export function FileContextProvider({
  children,
  enableUrlSync = true,
  enablePersistence = true 
}: FileContextProviderProps) {
  const [state, dispatch] = useReducer(fileContextReducer, initialFileContextState);

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

  // File operations using unified addFiles helper
  const addRawFiles = useCallback(async (files: File[]): Promise<File[]> => {
    return addFiles('raw', { files }, stateRef, filesRef, dispatch);
  }, []);

  const addProcessedFiles = useCallback(async (filesWithThumbnails: Array<{ file: File; thumbnail?: string; pageCount?: number }>): Promise<File[]> => {
    return addFiles('processed', { filesWithThumbnails }, stateRef, filesRef, dispatch);
  }, []);

  const addStoredFiles = useCallback(async (filesWithMetadata: Array<{ file: File; originalId: FileId; metadata: any }>): Promise<File[]> => {
    return addFiles('stored', { filesWithMetadata }, stateRef, filesRef, dispatch);
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
    removeFiles: (fileIds: FileId[], deleteFromStorage?: boolean) => 
      lifecycleManager.removeFiles(fileIds, stateRef),
    updateFileRecord: (fileId: FileId, updates: Partial<FileRecord>) => 
      lifecycleManager.updateFileRecord(fileId, updates, stateRef),
    clearAllFiles: () => {
      lifecycleManager.cleanupAllFiles();
      filesRef.current.clear();
      dispatch({ type: 'RESET_CONTEXT' });
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
    unpinFileWrapper
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