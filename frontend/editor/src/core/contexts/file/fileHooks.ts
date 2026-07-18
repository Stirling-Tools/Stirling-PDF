/**
 * Performant file hooks — selector subscriptions over the FileStateStore.
 * Each hook re-renders its consumer only when the slice it selects changes,
 * not on every file-state change.
 */

import { useContext, useMemo } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector.js";
import {
  FileStoreContext,
  FileActionsContext,
  FileStateStore,
  FileContextStateValue,
  FileContextActionsValue,
} from "@app/contexts/file/contexts";
import {
  StirlingFileStub,
  StirlingFile,
  FileContextState,
} from "@app/types/fileContext";
import { FileId } from "@app/types/file";

/** Shallow equality over object/array slices assembled by selectors. */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    return false;
  }
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) =>
    Object.is(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  );
}

function useFileStore(): FileStateStore {
  const store = useContext(FileStoreContext);
  if (!store) {
    throw new Error("File hooks must be used within a FileContextProvider");
  }
  return store;
}

/**
 * Subscribe to a slice of file state. The component re-renders only when the
 * selected value changes (Object.is by default; pass shallowEqual for slices
 * assembled into fresh objects/arrays).
 */
export function useFileSelector<T>(
  selector: (state: FileContextState) => T,
  isEqual?: (a: T, b: T) => boolean,
): T {
  const store = useFileStore();
  return useSyncExternalStoreWithSelector(
    store.subscribe,
    store.getState,
    store.getState,
    selector,
    isEqual,
  );
}

/**
 * Hook for accessing file state (will re-render on any state change)
 * Use individual selector hooks below for better performance
 */
export function useFileState(): FileContextStateValue {
  const store = useFileStore();
  const state = useFileSelector((s) => s);
  return useMemo(
    () => ({ state, selectors: store.selectors }),
    [state, store.selectors],
  );
}

/**
 * Hook for accessing file actions (stable - won't cause re-renders)
 */
export function useFileActions(): FileContextActionsValue {
  const context = useContext(FileActionsContext);
  if (!context) {
    throw new Error("useFileActions must be used within a FileContextProvider");
  }
  return context;
}

/**
 * Hook for current/primary file (first in list)
 */
export function useCurrentFile(): { file?: File; record?: StirlingFileStub } {
  const { selectors } = useFileStore();
  const { primaryFileId, record } = useFileSelector(
    (s) => ({
      primaryFileId: s.files.ids[0],
      record: s.files.ids[0] ? s.files.byId[s.files.ids[0]] : undefined,
    }),
    shallowEqual,
  );

  return useMemo(
    () => ({
      file: primaryFileId ? selectors.getFile(primaryFileId) : undefined,
      record,
    }),
    [primaryFileId, record, selectors],
  );
}

/**
 * Hook for file selection state and actions
 */
export function useFileSelection() {
  const { selectors } = useFileStore();
  const { actions } = useFileActions();
  const selectedFileIds = useFileSelector((s) => s.ui.selectedFileIds);
  const selectedPageNumbers = useFileSelector((s) => s.ui.selectedPageNumbers);
  // Only the SELECTED files' records — an unrelated file's update never
  // re-renders selection consumers.
  const selectedStubs = useFileSelector(
    (s) => s.ui.selectedFileIds.map((id) => s.files.byId[id]),
    shallowEqual,
  );

  // Memoize selected files to avoid recreating arrays
  const selectedFiles = useMemo(() => {
    return selectors.getSelectedFiles();
  }, [selectedFileIds, selectedStubs, selectors]);

  return useMemo(
    () => ({
      selectedFiles,
      selectedFileIds,
      selectedPageNumbers,
      setSelectedFiles: actions.setSelectedFiles,
      setSelectedPages: actions.setSelectedPages,
      clearSelections: actions.clearSelections,
    }),
    [
      selectedFiles,
      selectedFileIds,
      selectedPageNumbers,
      actions.setSelectedFiles,
      actions.setSelectedPages,
      actions.clearSelections,
    ],
  );
}

/**
 * Hook for file management operations
 */
export function useFileManagement() {
  const { actions } = useFileActions();

  return useMemo(
    () => ({
      addFiles: actions.addFiles,
      removeFiles: actions.removeFiles,
      clearAllFiles: actions.clearAllFiles,
      updateStirlingFileStub: actions.updateStirlingFileStub,
      reorderFiles: actions.reorderFiles,
    }),
    [actions],
  );
}

/**
 * Hook for UI state
 */
export function useFileUI() {
  const { actions } = useFileActions();
  const ui = useFileSelector(
    (s) => ({
      isProcessing: s.ui.isProcessing,
      processingProgress: s.ui.processingProgress,
      hasUnsavedChanges: s.ui.hasUnsavedChanges,
    }),
    shallowEqual,
  );

  return useMemo(
    () => ({
      ...ui,
      setProcessing: actions.setProcessing,
      setUnsavedChanges: actions.setHasUnsavedChanges,
    }),
    [ui, actions],
  );
}

/**
 * Hook for specific file by ID (optimized for individual file access):
 * re-renders only when THAT file's record changes.
 */
export function useStirlingFileStub(fileId: FileId): {
  file?: File;
  record?: StirlingFileStub;
} {
  const { selectors } = useFileStore();
  const record = useFileSelector((s) => s.files.byId[fileId]);

  return useMemo(
    () => ({
      file: selectors.getFile(fileId),
      record,
    }),
    [fileId, record, selectors],
  );
}

/**
 * Hook for all files: re-renders on file-list changes only (not selection/UI).
 */
export function useAllFiles(): {
  files: StirlingFile[];
  fileStubs: StirlingFileStub[];
  fileIds: FileId[];
} {
  const { selectors } = useFileStore();
  const files = useFileSelector((s) => s.files);

  return useMemo(
    () => ({
      files: selectors.getFiles(files.ids),
      fileStubs: selectors.getStirlingFileStubs(files.ids),
      fileIds: files.ids,
    }),
    [files, selectors],
  );
}

/**
 * Hook for selected files (optimized for selection-based UI)
 */
export function useSelectedFiles(): {
  selectedFiles: StirlingFile[];
  selectedFileStubs: StirlingFileStub[];
  selectedFileIds: FileId[];
} {
  const { selectors } = useFileStore();
  const selectedFileIds = useFileSelector((s) => s.ui.selectedFileIds);
  // Only the SELECTED files' records — see useFileSelection.
  const selectedStubs = useFileSelector(
    (s) => s.ui.selectedFileIds.map((id) => s.files.byId[id]),
    shallowEqual,
  );

  return useMemo(
    () => ({
      selectedFiles: selectors.getSelectedFiles(),
      selectedFileStubs: selectors.getSelectedStirlingFileStubs(),
      selectedFileIds,
    }),
    [selectedFileIds, selectedStubs, selectors],
  );
}

/**
 * Primary API hook for file context operations. Used by tools for core file
 * context functionality. Re-renders only when the slices it exposes reactively
 * (files, pinned files) change — not on selection/UI changes.
 */
export function useFileContext() {
  const store = useFileStore();
  const { actions } = useFileActions();
  const { files, pinnedFiles } = useFileSelector(
    (s) => ({ files: s.files, pinnedFiles: s.pinnedFiles }),
    shallowEqual,
  );

  return useMemo(() => {
    const { selectors } = store;
    return {
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
      markOperationFailed: (
        _fileId: FileId,
        _operationId: string,
        _error: string,
      ) => {}, // Operation tracking not implemented
      // File ID lookup (reads live state at call time)
      findFileId: (file: File) => {
        const { files: liveFiles } = store.getState();
        return liveFiles.ids.find((id) => {
          const record = liveFiles.byId[id];
          return (
            record &&
            record.name === file.name &&
            record.size === file.size &&
            record.lastModified === file.lastModified
          );
        });
      },

      // Pinned files
      pinnedFiles,
      pinFile: actions.pinFile,
      unpinFile: actions.unpinFile,
      isFilePinned: selectors.isFilePinned,

      // Active files
      activeFiles: selectors.getFiles(files.ids),
      openEncryptedUnlockPrompt: actions.openEncryptedUnlockPrompt,

      // Direct access to actions and selectors (for advanced use cases)
      actions,
      selectors,
    };
  }, [files, pinnedFiles, actions, store]);
}
