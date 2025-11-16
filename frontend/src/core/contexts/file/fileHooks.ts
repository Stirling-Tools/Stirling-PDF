/**
 * Performant file hooks - Clean API using FileContext
 */

import { useContext, useMemo } from 'react';
import {
  FileStateContext,
  FileActionsContext,
  FileContextStateValue,
  FileContextActionsValue
} from '@app/contexts/file/contexts';
import { StirlingFileStub, StirlingFile } from '@app/types/fileContext';
import { FileId } from '@app/types/file';

/**
 * Hook for accessing file state (will re-render on any state change)
 * Use individual selector hooks below for better performance
 */
export function useFileState(): FileContextStateValue {
  const context = useContext(FileStateContext);
  if (!context) {
    throw new Error('useFileState must be used within a FileContextProvider');
  }
  return context;
}

/**
 * Hook for accessing file actions (stable - won't cause re-renders)
 */
export function useFileActions(): FileContextActionsValue {
  const context = useContext(FileActionsContext);
  if (!context) {
    throw new Error('useFileActions must be used within a FileContextProvider');
  }
  return context;
}

/**
 * Hook for current/primary file (first in list)
 */
export function useCurrentFile(): { file?: File; record?: StirlingFileStub } {
  const { state, selectors } = useFileState();

  const primaryFileId = state.files.ids[0];
  return useMemo(() => ({
    file: primaryFileId ? selectors.getFile(primaryFileId) : undefined,
    record: primaryFileId ? selectors.getStirlingFileStub(primaryFileId) : undefined
  }), [primaryFileId, selectors]);
}

/**
 * Hook for file selection state and actions
 */
export function useFileSelection() {
  const { state, selectors } = useFileState();
  const { actions } = useFileActions();

  // Memoize selected files to avoid recreating arrays
  const selectedFiles = useMemo(() => {
    return selectors.getSelectedFiles();
  }, [state.ui.selectedFileIds, selectors]);

  return useMemo(() => ({
    selectedFiles,
    selectedFileIds: state.ui.selectedFileIds,
    selectedPageNumbers: state.ui.selectedPageNumbers,
    setSelectedFiles: actions.setSelectedFiles,
    setSelectedPages: actions.setSelectedPages,
    clearSelections: actions.clearSelections
  }), [
    selectedFiles,
    state.ui.selectedFileIds,
    state.ui.selectedPageNumbers,
    actions.setSelectedFiles,
    actions.setSelectedPages,
    actions.clearSelections
  ]);
}

/**
 * Hook for file management operations
 */
export function useFileManagement() {
  const { actions } = useFileActions();

  return useMemo(() => ({
    addFiles: actions.addFiles,
    removeFiles: actions.removeFiles,
    clearAllFiles: actions.clearAllFiles,
    updateStirlingFileStub: actions.updateStirlingFileStub,
    reorderFiles: actions.reorderFiles
  }), [actions]);
}

/**
 * Hook for UI state
 */
export function useFileUI() {
  const { state } = useFileState();
  const { actions } = useFileActions();

  return useMemo(() => ({
    isProcessing: state.ui.isProcessing,
    processingProgress: state.ui.processingProgress,
    hasUnsavedChanges: state.ui.hasUnsavedChanges,
    setProcessing: actions.setProcessing,
    setUnsavedChanges: actions.setHasUnsavedChanges
  }), [state.ui, actions]);
}

/**
 * Hook for specific file by ID (optimized for individual file access)
 */
export function useStirlingFileStub(fileId: FileId): { file?: File; record?: StirlingFileStub } {
  const { selectors } = useFileState();

  return useMemo(() => ({
    file: selectors.getFile(fileId),
    record: selectors.getStirlingFileStub(fileId)
  }), [fileId, selectors]);
}

/**
 * Hook for all files (use sparingly - causes re-renders on file list changes)
 */
export function useAllFiles(): { files: StirlingFile[]; fileStubs: StirlingFileStub[]; fileIds: FileId[] } {
  const { state, selectors } = useFileState();

  return useMemo(() => ({
    files: selectors.getFiles(),
    fileStubs: selectors.getStirlingFileStubs(),
    fileIds: state.files.ids
  }), [state.files.ids, selectors]);
}

/**
 * Hook for selected files (optimized for selection-based UI)
 */
export function useSelectedFiles(): { selectedFiles: StirlingFile[]; selectedFileStubs: StirlingFileStub[]; selectedFileIds: FileId[] } {
  const { state, selectors } = useFileState();

  return useMemo(() => ({
    selectedFiles: selectors.getSelectedFiles(),
    selectedFileStubs: selectors.getSelectedStirlingFileStubs(),
    selectedFileIds: state.ui.selectedFileIds
  }), [state.ui.selectedFileIds, selectors]);
}

// Navigation management removed - moved to NavigationContext

/**
 * Primary API hook for file context operations
 * Used by tools for core file context functionality
 */
export function useFileContext() {
  const { state, selectors } = useFileState();
  const { actions } = useFileActions();

  return useMemo(() => ({
    // Lifecycle management
    trackBlobUrl: actions.trackBlobUrl,
    scheduleCleanup: actions.scheduleCleanup,
    setUnsavedChanges: actions.setHasUnsavedChanges,

    // File management
    addFiles: actions.addFiles,
    consumeFiles: actions.consumeFiles,
    undoConsumeFiles: actions.undoConsumeFiles,
    recordOperation: (_fileId: FileId, _operation: any) => {}, // Operation tracking not implemented
    markOperationApplied: (_fileId: FileId, _operationId: string) => {}, // Operation tracking not implemented
    markOperationFailed: (_fileId: FileId, _operationId: string, _error: string) => {}, // Operation tracking not implemented
    // File ID lookup
    findFileId: (file: File) => {
      return state.files.ids.find(id => {
        const record = state.files.byId[id];
        return record &&
               record.name === file.name &&
               record.size === file.size &&
               record.lastModified === file.lastModified;
      });
    },

    // Pinned files
    pinnedFiles: state.pinnedFiles,
    pinFile: actions.pinFile,
    unpinFile: actions.unpinFile,
    isFilePinned: selectors.isFilePinned,

    // Active files
    activeFiles: selectors.getFiles(),
    openEncryptedUnlockPrompt: actions.openEncryptedUnlockPrompt,

    // Direct access to actions and selectors (for advanced use cases)
    actions,
    selectors
  }), [state, selectors, actions]);
}


