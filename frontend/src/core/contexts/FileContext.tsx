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

import { useReducer, useCallback, useEffect, useRef, useMemo, useState } from 'react';
import {
  FileContextProviderProps,
  FileContextSelectors,
  FileContextStateValue,
  FileContextActionsValue,
  FileContextActions,
  FileId,
  StirlingFileStub,
  StirlingFile,
  createStirlingFile,
} from '@app/types/fileContext';

// Import modular components
import { fileContextReducer, initialFileContextState } from '@app/contexts/file/FileReducer';
import { createFileSelectors } from '@app/contexts/file/fileSelectors';
import { addFiles, addStirlingFileStubs, consumeFiles, undoConsumeFiles, createFileActions, createChildStub, generateProcessedFileMetadata } from '@app/contexts/file/fileActions';
import { FileLifecycleManager } from '@app/contexts/file/lifecycle';
import { FileStateContext, FileActionsContext } from '@app/contexts/file/contexts';
import { IndexedDBProvider, useIndexedDB } from '@app/contexts/IndexedDBContext';
import { useZipConfirmation } from '@app/hooks/useZipConfirmation';
import ZipWarningModal from '@app/components/shared/ZipWarningModal';
import EncryptedPdfUnlockModal from '@app/components/shared/EncryptedPdfUnlockModal';
import { useTranslation } from 'react-i18next';
import { alert } from '@app/components/toast';
import { buildRemovePasswordFormData } from '@app/hooks/tools/removePassword/buildRemovePasswordFormData';
import type { RemovePasswordParameters } from '@app/hooks/tools/removePassword/useRemovePasswordParameters';
import apiClient from '@app/services/apiClient';
import { processResponse } from '@app/utils/toolResponseProcessor';
import { ToolOperation } from '@app/types/file';
import { handlePasswordError } from '@app/utils/toolErrorHandler';

const DEBUG = process.env.NODE_ENV === 'development';


// Inner provider component that has access to IndexedDB
function FileContextInner({
  children,
  enablePersistence = true
}: FileContextProviderProps) {
  const [state, dispatch] = useReducer(fileContextReducer, initialFileContextState);

  // Always call the hook unconditionally to satisfy React's rules of hooks.
  // IndexedDB context is only used when enablePersistence is true.
  const indexedDBValue = useIndexedDB();
  const indexedDB = enablePersistence ? indexedDBValue : null;

  // File ref map - stores File objects outside React state
  const filesRef = useRef<Map<FileId, File>>(new Map());

  // Stable state reference for selectors
  const stateRef = useRef(state);
  stateRef.current = state;

  // ZIP confirmation dialog
  const { confirmationState, requestConfirmation, handleConfirm, handleCancel } = useZipConfirmation();

  // Create lifecycle manager
  const lifecycleManagerRef = useRef<FileLifecycleManager | null>(null);
  if (!lifecycleManagerRef.current) {
    lifecycleManagerRef.current = new FileLifecycleManager(filesRef, dispatch);
  }
  const lifecycleManager = lifecycleManagerRef.current;
  const { t } = useTranslation();

  const [encryptedQueue, setEncryptedQueue] = useState<FileId[]>([]);
  const [activeEncryptedFileId, setActiveEncryptedFileId] = useState<FileId | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const dismissedEncryptedFilesRef = useRef<Set<FileId>>(new Set());
  const observedFileIdsRef = useRef<Set<FileId>>(new Set());

  const enqueueEncryptedFiles = useCallback((fileIds: FileId[]) => {
    if (fileIds.length === 0) return;
    setEncryptedQueue(prevQueue => {
      const existing = new Set(prevQueue);
      const next = [...prevQueue];
      for (const id of fileIds) {
        if (dismissedEncryptedFilesRef.current.has(id)) continue;
        if (id === activeEncryptedFileId) continue;
        if (existing.has(id)) continue;
        existing.add(id);
        next.push(id);
      }
      return next;
    });
  }, [activeEncryptedFileId]);

  useEffect(() => {
    const previousIds = observedFileIdsRef.current;
    const nextIds = new Set(state.files.ids);
    const newEncryptedIds: FileId[] = [];

    for (const id of state.files.ids) {
      if (!previousIds.has(id)) {
        const stub = state.files.byId[id];
        if ((stub?.versionNumber ?? 1) <= 1 && stub?.processedFile?.isEncrypted) {
          newEncryptedIds.push(id);
        }
      }
    }

    if (newEncryptedIds.length > 0) {
      enqueueEncryptedFiles(newEncryptedIds);
    }

    observedFileIdsRef.current = nextIds;
  }, [state.files.ids, state.files.byId, enqueueEncryptedFiles]);

  useEffect(() => {
    if (!activeEncryptedFileId && encryptedQueue.length > 0) {
      setActiveEncryptedFileId(encryptedQueue[0]);
      setEncryptedQueue(prev => prev.slice(1));
    }
  }, [activeEncryptedFileId, encryptedQueue]);

  useEffect(() => {
    if (activeEncryptedFileId && !state.files.ids.includes(activeEncryptedFileId)) {
      setActiveEncryptedFileId(null);
    }
  }, [activeEncryptedFileId, state.files.ids]);

  useEffect(() => {
    setUnlockPassword('');
    setUnlockError(null);
  }, [activeEncryptedFileId]);

  const handleUnlockSkip = useCallback(() => {
    if (activeEncryptedFileId) {
      dismissedEncryptedFilesRef.current.add(activeEncryptedFileId);
    }
    setActiveEncryptedFileId(null);
  }, [activeEncryptedFileId]);

  const promptEncryptedUnlock = useCallback((fileId: FileId) => {
    const stub = stateRef.current.files.byId[fileId];
    if (!stub?.processedFile?.isEncrypted) {
      return;
    }

    dismissedEncryptedFilesRef.current.delete(fileId);

    setEncryptedQueue(prevQueue => prevQueue.filter(id => id !== fileId));

    setActiveEncryptedFileId(currentActiveId => {
      if (currentActiveId && currentActiveId !== fileId) {
        setEncryptedQueue(prevQueue => {
          const withoutDuplicates = prevQueue.filter(id => id !== currentActiveId && id !== fileId);
          return [currentActiveId, ...withoutDuplicates];
        });
      }
      return fileId;
    });
  }, []);

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
        skipAutoUnzip: true,
        // Provide confirmation callback for large ZIP files
        confirmLargeExtraction: requestConfirmation
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
  }, [enablePersistence, requestConfirmation]);

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

  const runAutomaticPasswordRemoval = useCallback(async (fileId: FileId, password: string): Promise<void> => {
    const file = filesRef.current.get(fileId);
    const parentStub = stateRef.current.files.byId[fileId];

    if (!file || !parentStub) {
      throw new Error(t('encryptedPdfUnlock.missingFile', 'The selected file is no longer available.'));
    }

    const params: RemovePasswordParameters = { password };
    const formData = buildRemovePasswordFormData(params, file);

    const response = await apiClient.post('/api/v1/security/remove-password', formData, {
      responseType: 'blob',
      suppressErrorToast: true  // Handle errors in modal UI instead of toast
    });
    const responseFiles = await processResponse(response.data, [file]);

    const unlockedFile = responseFiles[0];
    if (!unlockedFile) {
      throw new Error(t('encryptedPdfUnlock.emptyResponse', 'Password removal did not produce a file.'));
    }

    const processedMetadata = await generateProcessedFileMetadata(unlockedFile);
    const thumbnail = processedMetadata?.thumbnailUrl;

    const operation: ToolOperation = {
      toolId: 'removePassword',
      timestamp: Date.now()
    };

    const childStub = createChildStub(parentStub, operation, unlockedFile, thumbnail, processedMetadata);
    const stirlingUnlockedFile = createStirlingFile(unlockedFile, childStub.id);

    await consumeFilesWrapper([fileId], [stirlingUnlockedFile], [childStub]);
  }, [consumeFilesWrapper, t]);

  const handleUnlockSubmit = useCallback(async () => {
    if (!activeEncryptedFileId) return;
    if (!unlockPassword.trim()) {
      setUnlockError(t('encryptedPdfUnlock.required', 'Enter the password to continue.'));
      return;
    }

    setIsUnlocking(true);
    setUnlockError(null);
    try {
      await runAutomaticPasswordRemoval(activeEncryptedFileId, unlockPassword.trim());
      const fileName = stateRef.current.files.byId[activeEncryptedFileId]?.name;
      alert({
        alertType: 'success',
        title: t('encryptedPdfUnlock.successTitle', 'Password removed'),
        body: fileName
          ? t('encryptedPdfUnlock.successBodyWithName', {
              defaultValue: 'Removed password from {{fileName}}',
              fileName,
            })
          : t('encryptedPdfUnlock.successBody', 'Password removed successfully.'),
        expandable: false,
        isPersistentPopup: false,
      });
      dismissedEncryptedFilesRef.current.delete(activeEncryptedFileId);
      setActiveEncryptedFileId(null);
    } catch (error) {
      const errorMessage = await handlePasswordError(
        error,
        t('encryptedPdfUnlock.incorrectPassword', 'Incorrect password'),
        t('removePassword.error.failed', 'An error occurred while removing the password from the PDF.')
      );
      setUnlockError(errorMessage);
    } finally {
      setIsUnlocking(false);
    }
  }, [activeEncryptedFileId, unlockPassword, runAutomaticPasswordRemoval, t]);

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
      // Check if any files have localFilePath (desktop mode)
      const filesWithLocalPaths: Array<{ id: FileId; path: string; name: string }> = [];
      for (const fileId of fileIds) {
        const stub = stateRef.current.files.byId[fileId];
        if (stub?.localFilePath) {
          filesWithLocalPaths.push({
            id: fileId,
            path: stub.localFilePath,
            name: stub.name
          });
        }
      }

      // Ask user if they want to delete from disk (desktop only)
      if (filesWithLocalPaths.length > 0) {
        const fileList = filesWithLocalPaths.map(f => `• ${f.name}`).join('\n');
        const message = filesWithLocalPaths.length === 1
          ? `Delete "${filesWithLocalPaths[0].name}" from disk?\n\nThis will permanently delete the file from:\n${filesWithLocalPaths[0].path}`
          : `Delete ${filesWithLocalPaths.length} files from disk?\n\n${fileList}\n\nThis will permanently delete these files from your computer.`;

        const shouldDeleteFromDisk = window.confirm(message);

        if (shouldDeleteFromDisk) {
          try {
            const { deleteLocalFile } = await import('@app/services/localFileSaveService');

            for (const file of filesWithLocalPaths) {
              const result = await deleteLocalFile(file.path);
              if (result.success) {
                console.log(`[FileContext] Deleted from disk: ${file.name}`);
              } else {
                console.warn(`[FileContext] Failed to delete from disk: ${file.name}`, result.error);
              }
            }
          } catch (error) {
            console.error('[FileContext] Failed to delete files from disk:', error);
          }
        }
      }

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
      lifecycleManager.scheduleCleanup(fileId, delay, stateRef),
    openEncryptedUnlockPrompt: promptEncryptedUnlock
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
    enablePersistence,
    promptEncryptedUnlock
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

  const activeEncryptedStub = activeEncryptedFileId ? state.files.byId[activeEncryptedFileId] : undefined;
  const isUnlockModalOpen = Boolean(activeEncryptedFileId && activeEncryptedStub);

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
        <ZipWarningModal
          opened={confirmationState.opened}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          fileCount={confirmationState.fileCount}
          zipFileName={confirmationState.fileName}
        />
        <EncryptedPdfUnlockModal
          opened={isUnlockModalOpen}
          fileName={activeEncryptedStub?.name}
          password={unlockPassword}
          errorMessage={unlockError}
          isProcessing={isUnlocking}
          onPasswordChange={setUnlockPassword}
          onUnlock={handleUnlockSubmit}
          onSkip={handleUnlockSkip}
        />
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
} from '@app/contexts/file/fileHooks';
