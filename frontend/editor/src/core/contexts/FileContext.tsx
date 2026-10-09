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

import {
  useReducer,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useState,
} from "react";
import {
  FileContextProviderProps,
  FileContextSelectors,
  FileContextActionsValue,
  FileContextActions,
  FileContextAction,
  FileId,
  StirlingFileStub,
  StirlingFile,
  createStirlingFile,
} from "@app/types/fileContext";

// Import modular components
import {
  fileContextReducer,
  initialFileContextState,
  withReducerIdentityGuard,
} from "@app/contexts/file/FileReducer";
import { createFileSelectors } from "@app/contexts/file/fileSelectors";
import {
  addFiles,
  addStirlingFileStubs,
  reconcileOpenFilesAt,
  consumeFiles,
  undoConsumeFiles,
  createFileActions,
  createChildStub,
  generateProcessedFileMetadata,
} from "@app/contexts/file/fileActions";
import { FileLifecycleManager } from "@app/contexts/file/lifecycle";
import {
  FileStoreContext,
  FileActionsContext,
  type FileStateStore,
} from "@app/contexts/file/contexts";
import {
  IndexedDBProvider,
  useIndexedDB,
} from "@app/contexts/IndexedDBContext";
import { onRecordUnreadable } from "@app/services/fileStorage";
import { useZipConfirmation } from "@app/hooks/useZipConfirmation";
import ZipWarningModal from "@app/components/shared/ZipWarningModal";
import EncryptedPdfUnlockModal from "@app/components/shared/EncryptedPdfUnlockModal";
import { useTranslation } from "react-i18next";
import { alert } from "@app/components/toast";
import { unlockPdfForSession } from "@app/services/pdfSessionUnlock";
import {
  bindPdfAccess,
  clearPdfAccess,
  forgetPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
} from "@app/services/pdfPasswordStore";
import { reportFilesRemoved } from "@app/services/failureReporting";
import {
  addPendingUnlocks,
  setPendingUnlocks,
} from "@app/services/pendingUnlocks";
import { handlePasswordError } from "@app/utils/toolErrorHandler";
import apiClient from "@app/services/apiClient";
import {
  buildRemovePasswordFormData,
  REMOVE_PASSWORD_ENDPOINT,
} from "@app/hooks/tools/removePassword/buildRemovePasswordFormData";

// Inner provider component that has access to IndexedDB
function FileContextInner({
  children,
  enablePersistence = true,
}: FileContextProviderProps) {
  // Guarded in dev: warns if a reducer case reallocates a slice without changing
  // it, which would silently defeat the selector-subscription bail-out.
  const guardedReducer = useMemo(
    () => withReducerIdentityGuard(fileContextReducer),
    [],
  );
  const [state, dispatch] = useReducer(guardedReducer, initialFileContextState);

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
  const {
    confirmationState,
    requestConfirmation,
    handleConfirm,
    handleCancel,
  } = useZipConfirmation();

  // Create lifecycle manager
  const lifecycleManagerRef = useRef<FileLifecycleManager | null>(null);
  if (!lifecycleManagerRef.current) {
    lifecycleManagerRef.current = new FileLifecycleManager(filesRef, dispatch);
  }
  const lifecycleManager = lifecycleManagerRef.current;
  const { t } = useTranslation();

  const [encryptedQueue, setEncryptedQueue] = useState<FileId[]>([]);
  const [activeEncryptedFileId, setActiveEncryptedFileId] =
    useState<FileId | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const observedFileIdsRef = useRef<Set<FileId>>(new Set());
  const admissionResults = useRef(
    new Map<FileId, Promise<boolean | StirlingFile>>(),
  );
  const pendingAdmissions = useRef(
    new Map<
      FileId,
      {
        stub: StirlingFileStub;
        admitted: Promise<boolean | StirlingFile>;
        resolve: (admitted: boolean | StirlingFile) => void;
      }
    >(),
  );

  const dispatchWithUnlock = useCallback((action: FileContextAction) => {
    if (
      action.type !== "ADD_FILES" &&
      action.type !== "CONSUME_FILES" &&
      action.type !== "UNDO_CONSUME_FILES"
    ) {
      dispatch(action);
      return;
    }
    const ready: StirlingFileStub[] = [];
    const locked: FileId[] = [];
    const stubs =
      action.type === "ADD_FILES"
        ? action.payload.stirlingFileStubs
        : action.type === "CONSUME_FILES"
          ? action.payload.outputStirlingFileStubs
          : action.payload.inputStirlingFileStubs;
    for (const stub of stubs) {
      if (!stub.processedFile?.isEncrypted || getPdfAccess(stub.id)) {
        ready.push(stub);
        continue;
      }
      if (pendingAdmissions.current.has(stub.id)) continue;
      let resolve!: (admitted: boolean | StirlingFile) => void;
      const admitted = new Promise<boolean | StirlingFile>((settle) => {
        resolve = settle;
      });
      pendingAdmissions.current.set(stub.id, { stub, admitted, resolve });
      admissionResults.current.set(stub.id, admitted);
      locked.push(stub.id);
    }
    if (locked.length) {
      addPendingUnlocks(locked);
      setEncryptedQueue((queue) => [...queue, ...locked]);
    }
    if (action.type === "UNDO_CONSUME_FILES") {
      dispatch({
        ...action,
        payload: { ...action.payload, inputStirlingFileStubs: ready },
      });
    } else if (action.type === "CONSUME_FILES") {
      dispatch({
        ...action,
        payload: { ...action.payload, outputStirlingFileStubs: ready },
      });
    } else if (ready.length)
      dispatch({
        ...action,
        payload: { ...action.payload, stirlingFileStubs: ready },
      });
  }, []);

  const awaitAdmissions = useCallback(async (files: StirlingFile[]) => {
    const admitted = await Promise.all(
      files.map(async (file) => {
        const admitted = admissionResults.current.get(file.fileId);
        const result = admitted ? await admitted : true;
        admissionResults.current.delete(file.fileId);
        return result === true ? file : result === false ? null : result;
      }),
    );
    return admitted.filter((file): file is StirlingFile => file !== null);
  }, []);

  const cancelPendingAdmissions = useCallback((ids: readonly FileId[]) => {
    for (const id of ids) {
      const pending = pendingAdmissions.current.get(id);
      if (!pending) continue;
      pendingAdmissions.current.delete(id);
      filesRef.current.delete(id);
      pending.resolve(false);
    }
    setEncryptedQueue((queue) => queue.filter((id) => !ids.includes(id)));
    setActiveEncryptedFileId((id) => (id && ids.includes(id) ? null : id));
  }, []);

  const enqueueEncryptedFiles = useCallback(
    (fileIds: FileId[]) => {
      if (fileIds.length === 0) return;
      setEncryptedQueue((prevQueue) => {
        const existing = new Set(prevQueue);
        const next = [...prevQueue];
        for (const id of fileIds) {
          if (id === activeEncryptedFileId) continue;
          if (existing.has(id)) continue;
          existing.add(id);
          next.push(id);
        }
        return next;
      });
    },
    [activeEncryptedFileId],
  );

  useEffect(() => {
    const previousIds = observedFileIdsRef.current;
    const nextIds = new Set<FileId>(state.files.ids);
    const newEncryptedIds: FileId[] = [];

    for (const id of state.files.ids) {
      if (!previousIds.has(id)) {
        const stub = state.files.byId[id];
        if (
          (stub?.versionNumber ?? 1) <= 1 &&
          stub?.processedFile?.isEncrypted &&
          !getPdfAccess(id)
        ) {
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
      setEncryptedQueue((prev) => prev.slice(1));
    }
  }, [activeEncryptedFileId, encryptedQueue]);

  useEffect(() => {
    if (
      activeEncryptedFileId &&
      !state.files.ids.includes(activeEncryptedFileId) &&
      !pendingAdmissions.current.has(activeEncryptedFileId)
    ) {
      setActiveEncryptedFileId(null);
    }
  }, [activeEncryptedFileId, state.files.ids]);

  // Upload policies wait for the prompt to settle; interactive credentials are not passed to automation.
  useEffect(() => {
    setPendingUnlocks([
      ...(activeEncryptedFileId ? [activeEncryptedFileId] : []),
      ...encryptedQueue,
      ...pendingAdmissions.current.keys(),
    ]);
  }, [activeEncryptedFileId, encryptedQueue, state.files.byId]);

  // The store outlives this provider, and a hold nobody can answer would stall the file's policy
  // for the rest of the session. Its own effect, so a change of prompt does not clear and re-set.
  useEffect(() => () => setPendingUnlocks([]), []);

  useEffect(() => {
    setUnlockPassword("");
    setUnlockError(null);
  }, [activeEncryptedFileId]);

  // Storage proved a file's bytes unreadable (WebKit losing a blob's backing
  // store). Drop it: the viewer would otherwise spin on a document that can
  // never load. The record stays, so a reload re-tests it.
  useEffect(
    () =>
      onRecordUnreadable((fileId) => {
        if (!stateRef.current.files.byId[fileId]) return;
        console.error(
          `[FileContext] dropping ${fileId} from the workbench: its stored bytes are unreadable`,
        );
        lifecycleManager.removeFiles([fileId], stateRef);
      }),
    [lifecycleManager],
  );

  const handleUnlockSkip = useCallback(() => {
    if (activeEncryptedFileId) {
      const pending = pendingAdmissions.current.get(activeEncryptedFileId);
      if (pending) {
        pendingAdmissions.current.delete(activeEncryptedFileId);
        filesRef.current.delete(activeEncryptedFileId);
        forgetPdfAccess([activeEncryptedFileId]);
        pending.resolve(false);
      } else {
        lifecycleManager.removeFiles([activeEncryptedFileId], stateRef);
      }
    }
    setActiveEncryptedFileId(null);
  }, [activeEncryptedFileId, lifecycleManager]);

  const promptEncryptedUnlock = useCallback((fileId: FileId) => {
    const stub =
      pendingAdmissions.current.get(fileId)?.stub ??
      stateRef.current.files.byId[fileId];
    if (!stub) return;
    if (!stub.processedFile?.isEncrypted) {
      dispatch({
        type: "UPDATE_FILE_RECORD",
        payload: {
          id: fileId,
          updates: {
            processedFile: {
              ...stub.processedFile,
              pages: stub.processedFile?.pages ?? [],
              isEncrypted: true,
            },
          },
        },
      });
    }

    setEncryptedQueue((prevQueue) => prevQueue.filter((id) => id !== fileId));

    setActiveEncryptedFileId((currentActiveId) => {
      if (currentActiveId && currentActiveId !== fileId) {
        setEncryptedQueue((prevQueue) => {
          const withoutDuplicates = prevQueue.filter(
            (id) => id !== currentActiveId && id !== fileId,
          );
          return [currentActiveId, ...withoutDuplicates];
        });
      }
      return fileId;
    });
  }, []);

  // Create stable selectors (memoized once to avoid re-renders)
  const selectors = useMemo<FileContextSelectors>(
    () => createFileSelectors(stateRef, filesRef),
    [], // Empty deps - selectors are stable
  );

  // Navigation management removed - moved to NavigationContext

  // Navigation guard system functions
  const setHasUnsavedChanges = useCallback((hasChanges: boolean) => {
    dispatch({ type: "SET_UNSAVED_CHANGES", payload: { hasChanges } });
  }, []);

  const selectFiles = (stirlingFiles: StirlingFile[]) => {
    const currentSelection = stateRef.current.ui.selectedFileIds;
    const newFileIds = stirlingFiles.map((stirlingFile) => stirlingFile.fileId);
    dispatch({
      type: "SET_SELECTED_FILES",
      payload: { fileIds: [...currentSelection, ...newFileIds] },
    });
  };

  // File operations using unified addFiles helper with persistence
  const addRawFiles = useCallback(
    async (
      files: File[],
      options?: {
        insertAfterPageId?: string;
        selectFiles?: boolean;
        skipAutoUnzip?: boolean;
        /** Persist to IDB without dispatching to workspace state. */
        skipWorkspaceDispatch?: boolean;
        skipUploadTracking?: boolean;
        derivedFromTool?: boolean;
        /** Folder every added file is born into (see AddFileOptions). */
        folderId?: string;
        /** Classification computed outside the policy system (see AddFileOptions). */
        presetClassification?: {
          labels: string[];
          confidence: StirlingFileStub["classificationConfidence"];
        };
        /** Bytes and stub only, no thumbnail parse (see AddFileOptions). */
        skipMetadataHydration?: boolean;
      },
    ): Promise<StirlingFile[]> => {
      const stirlingFiles = await addFiles(
        {
          files,
          ...options,
          // For direct file uploads: ALWAYS unzip (except HTML ZIPs)
          // skipAutoUnzip bypasses preference checks - HTML detection still applies
          skipAutoUnzip: true,
          // Provide confirmation callback for large ZIP files
          confirmLargeExtraction: requestConfirmation,
        },
        stateRef,
        filesRef,
        dispatchWithUnlock,
        lifecycleManager,
        enablePersistence,
      );

      if (stirlingFiles.length > 0) {
        indexedDB?.bumpRevision?.();
      }
      const admitted = await awaitAdmissions(stirlingFiles);
      if (options?.selectFiles && admitted.length > 0) selectFiles(admitted);
      return admitted;
    },
    [
      enablePersistence,
      requestConfirmation,
      indexedDB,
      dispatchWithUnlock,
      awaitAdmissions,
    ],
  );

  const addFilesWithOptions = useCallback(
    async (
      files: File[],
      options?: {
        insertAfterPageId?: string;
        selectFiles?: boolean;
        autoUnzip?: boolean;
        autoUnzipFileLimit?: number;
        skipAutoUnzip?: boolean;
        confirmLargeExtraction?: (
          fileCount: number,
          fileName: string,
        ) => Promise<boolean>;
        allowDuplicates?: boolean;
        skipUploadTracking?: boolean;
      },
    ): Promise<StirlingFile[]> => {
      const stirlingFiles = await addFiles(
        {
          files,
          ...options,
        },
        stateRef,
        filesRef,
        dispatchWithUnlock,
        lifecycleManager,
        enablePersistence,
      );

      if (stirlingFiles.length > 0) {
        indexedDB?.bumpRevision?.();
      }
      const admitted = await awaitAdmissions(stirlingFiles);
      if (options?.selectFiles && admitted.length > 0) selectFiles(admitted);
      return admitted;
    },
    [enablePersistence, indexedDB, dispatchWithUnlock, awaitAdmissions],
  );

  const addStirlingFileStubsAction = useCallback(
    async (
      stirlingFileStubs: StirlingFileStub[],
      options?: { insertAfterPageId?: string; selectFiles?: boolean },
    ): Promise<StirlingFile[]> => {
      // StirlingFileStubs preserve all metadata - perfect for FileManager use case!
      const result = await addStirlingFileStubs(
        stirlingFileStubs,
        options,
        stateRef,
        filesRef,
        dispatchWithUnlock,
        lifecycleManager,
      );

      const admitted = await awaitAdmissions(result);
      if (options?.selectFiles && admitted.length > 0) selectFiles(admitted);
      return admitted;
    },
    [dispatchWithUnlock, awaitAdmissions],
  );

  const reconcileOpenFilesAction = useCallback(
    (locations: string[]) =>
      reconcileOpenFilesAt(locations, stateRef, filesRef, lifecycleManager),
    [],
  );

  // Action creators
  const baseActions = useMemo(
    () => createFileActions(dispatchWithUnlock),
    [dispatchWithUnlock],
  );

  // Helper functions for pinned files
  const consumeFilesWrapper = useCallback(
    async (
      inputFileIds: FileId[],
      outputStirlingFiles: StirlingFile[],
      outputStirlingFileStubs: StirlingFileStub[],
      options?: { silent?: boolean },
    ): Promise<FileId[]> => {
      for (const file of outputStirlingFiles) bindPdfAccess(file, file.fileId);
      await consumeFiles(
        inputFileIds,
        outputStirlingFiles,
        outputStirlingFileStubs,
        filesRef,
        dispatchWithUnlock,
        options,
      );
      const admitted = await awaitAdmissions(outputStirlingFiles);
      return admitted.map((file) => file.fileId);
    },
    [dispatchWithUnlock, awaitAdmissions],
  );

  const runSessionUnlock = useCallback(
    async (fileId: FileId, password: string): Promise<void> => {
      const file = filesRef.current.get(fileId);
      const pending = pendingAdmissions.current.get(fileId);
      const parentStub = pending?.stub ?? stateRef.current.files.byId[fileId];

      if (!file || !parentStub) {
        throw new Error(
          t(
            "encryptedPdfUnlock.missingFile",
            "The selected file is no longer available.",
          ),
        );
      }

      const access = await unlockPdfForSession(file, password);
      if (filesRef.current.get(fileId) !== file) {
        return;
      }
      if (pending) {
        dispatch({
          type: "ADD_FILES",
          payload: { stirlingFileStubs: [parentStub] },
        });
      }
      rememberPdfAccess(file, access);
      bindPdfAccess(file, fileId);
      const metadata = await generateProcessedFileMetadata(file);
      if (filesRef.current.get(fileId) !== file) return;
      const updates: Partial<StirlingFileStub> = {
        processedFile: {
          ...metadata,
          pages: metadata?.pages ?? [],
          totalPages: access.pageCount,
          isEncrypted: access.encrypted,
        },
        thumbnailUrl: metadata?.thumbnailUrl,
      };
      dispatch({
        type: "UPDATE_FILE_RECORD",
        payload: { id: fileId, updates },
      });
      pendingAdmissions.current.delete(fileId);
      pending?.resolve(true);
    },
    [t],
  );

  const runPasswordRemoval = useCallback(
    async (fileId: FileId, password: string): Promise<void> => {
      const file = filesRef.current.get(fileId);
      const pending = pendingAdmissions.current.get(fileId);
      const sourceStub = pending?.stub ?? stateRef.current.files.byId[fileId];
      if (!file || !sourceStub) {
        throw new Error(
          t(
            "encryptedPdfUnlock.missingFile",
            "The selected file is no longer available.",
          ),
        );
      }
      const response = await apiClient.post<Blob>(
        REMOVE_PASSWORD_ENDPOINT,
        buildRemovePasswordFormData({ password }, file),
        {
          responseType: "blob",
          suppressErrorToast: true,
        },
      );
      if (filesRef.current.get(fileId) !== file) return;
      const copy = new File(
        [response.data],
        `${file.name.replace(/\.pdf$/i, "")}_unprotected.pdf`,
        {
          type: "application/pdf",
        },
      );
      const metadata = await generateProcessedFileMetadata(copy);
      if (filesRef.current.get(fileId) !== file) return;
      if (metadata?.isEncrypted) {
        throw new Error(
          t(
            "removePassword.error.failed",
            "An error occurred while removing the password from the PDF.",
          ),
        );
      }
      const stub = createChildStub(
        sourceStub,
        { toolId: "removePassword", timestamp: Date.now() },
        copy,
        metadata?.thumbnailUrl,
        metadata,
      );
      // An explicit copy must not inherit a save target that could overwrite the protected source.
      stub.localFilePath = undefined;
      stub.isDirty = undefined;
      stub.diskSyncedSize = undefined;
      stub.diskSyncedModifiedMs = undefined;
      stub.blobUrl = undefined;
      const output = createStirlingFile(copy, stub.id);
      await consumeFiles(
        [fileId],
        [output],
        [stub],
        filesRef,
        dispatchWithUnlock,
      );
      pendingAdmissions.current.delete(fileId);
      pending?.resolve(output);
      indexedDB?.bumpRevision?.();
    },
    [t, dispatchWithUnlock, indexedDB],
  );

  const handleUnlockSubmit = useCallback(
    async (removePassword = false) => {
      if (!activeEncryptedFileId || isUnlocking) return;
      if (unlockPassword.length === 0) {
        setUnlockError(
          t("encryptedPdfUnlock.required", "Enter the password to continue."),
        );
        return;
      }

      setIsUnlocking(true);
      setUnlockError(null);
      try {
        if (removePassword) {
          await runPasswordRemoval(activeEncryptedFileId, unlockPassword);
        } else {
          await runSessionUnlock(activeEncryptedFileId, unlockPassword);
        }
        const fileName =
          stateRef.current.files.byId[activeEncryptedFileId]?.name;
        alert({
          alertType: "success",
          title: removePassword
            ? t("encryptedPdfUnlock.copyCreated", "Unprotected copy created")
            : t("encryptedPdfUnlock.sessionSuccessTitle", "PDF unlocked"),
          body: removePassword
            ? t(
                "encryptedPdfUnlock.originalProtected",
                "The original PDF stays protected.",
              )
            : fileName
              ? t("encryptedPdfUnlock.sessionSuccessBodyWithName", {
                  defaultValue:
                    "Unlocked {{fileName}} for this session. Password protection is retained.",
                  fileName,
                })
              : t(
                  "encryptedPdfUnlock.sessionSuccessBody",
                  "Unlocked for this session. Password protection is retained.",
                ),
          expandable: false,
          isPersistentPopup: false,
        });
        setActiveEncryptedFileId(null);
      } catch (error) {
        const errorMessage = await handlePasswordError(
          error,
          t("encryptedPdfUnlock.incorrectPassword", "Incorrect password"),
          removePassword
            ? t(
                "removePassword.error.failed",
                "An error occurred while removing the password from the PDF.",
              )
            : t(
                "encryptedPdfUnlock.sessionFailed",
                "Unable to unlock this PDF. Please try again.",
              ),
        );
        setUnlockError(errorMessage);
      } finally {
        setIsUnlocking(false);
      }
    },
    [
      activeEncryptedFileId,
      unlockPassword,
      isUnlocking,
      runSessionUnlock,
      runPasswordRemoval,
      t,
    ],
  );

  const handleUnlockAll = useCallback(async () => {
    if (!activeEncryptedFileId) return;
    const pw = unlockPassword;
    if (!pw) {
      setUnlockError(
        t("encryptedPdfUnlock.required", "Enter the password to continue."),
      );
      return;
    }

    setIsUnlocking(true);
    setUnlockError(null);

    const allIds = [activeEncryptedFileId, ...encryptedQueue];
    let successCount = 0;
    const failedIds: FileId[] = [];

    for (const fileId of allIds) {
      try {
        await runSessionUnlock(fileId, pw);
        successCount++;
      } catch {
        failedIds.push(fileId);
      }
    }

    if (successCount > 0) {
      alert({
        alertType: "success",
        title: t("encryptedPdfUnlock.sessionSuccessTitle", "PDF unlocked"),
        body: t("encryptedPdfUnlock.unlockAllSuccess", {
          defaultValue: "Unlocked {{count}} file(s).",
          count: successCount,
        }),
        expandable: false,
        isPersistentPopup: false,
      });
    }

    if (failedIds.length > 0) {
      const failedNames = failedIds.map(
        (id) => stateRef.current.files.byId[id]?.name ?? id,
      );
      setUnlockError(
        t("encryptedPdfUnlock.unlockAllPartialFail", {
          defaultValue: "Wrong password for: {{names}}",
          names: failedNames.join(", "),
        }),
      );
      setEncryptedQueue(failedIds.slice(1));
      setActiveEncryptedFileId(failedIds[0]);
    } else {
      setEncryptedQueue([]);
      setActiveEncryptedFileId(null);
    }

    setIsUnlocking(false);
  }, [
    activeEncryptedFileId,
    encryptedQueue,
    unlockPassword,
    runSessionUnlock,
    t,
  ]);

  const undoConsumeFilesWrapper = useCallback(
    async (
      inputFiles: File[],
      inputStirlingFileStubs: StirlingFileStub[],
      outputFileIds: FileId[],
    ): Promise<void> => {
      return undoConsumeFiles(
        inputFiles,
        inputStirlingFileStubs,
        outputFileIds,
        filesRef,
        dispatchWithUnlock,
        indexedDB,
      );
    },
    [indexedDB, dispatchWithUnlock],
  );

  // File pinning functions - use StirlingFile directly
  const pinFileWrapper = useCallback(
    (file: StirlingFile) => {
      baseActions.pinFile(file.fileId);
    },
    [baseActions],
  );

  const unpinFileWrapper = useCallback(
    (file: StirlingFile) => {
      baseActions.unpinFile(file.fileId);
    },
    [baseActions],
  );

  // Complete actions object
  const actions = useMemo<FileContextActions>(
    () => ({
      ...baseActions,
      addFiles: addRawFiles,
      addFilesWithOptions,
      addStirlingFileStubs: addStirlingFileStubsAction,
      reconcileOpenFiles: reconcileOpenFilesAction,
      removeFiles: async (fileIds: FileId[], deleteFromStorage?: boolean) => {
        cancelPendingAdmissions(fileIds);
        forgetPdfAccess(fileIds);
        // Remove from memory and cleanup resources
        lifecycleManager.removeFiles(fileIds, stateRef);

        // Only a real delete closes a failure: most callers pass false and mean "take it out of the
        // workbench", leaving the document, and its failures, very much alive.
        if (deleteFromStorage !== false) {
          void reportFilesRemoved(fileIds);
        }

        // Remove from IndexedDB if enabled
        if (indexedDB && enablePersistence && deleteFromStorage !== false) {
          try {
            await indexedDB.deleteMultiple(fileIds);
          } catch (error) {
            console.error("Failed to delete files from IndexedDB:", error);
          }
        }
      },
      updateStirlingFileStub: (
        fileId: FileId,
        updates: Partial<StirlingFileStub>,
      ) => lifecycleManager.updateStirlingFileStub(fileId, updates, stateRef),
      reorderFiles: (orderedFileIds: FileId[]) => {
        dispatch({ type: "REORDER_FILES", payload: { orderedFileIds } });
      },
      clearAllFiles: async () => {
        cancelPendingAdmissions([...pendingAdmissions.current.keys()]);
        clearPdfAccess();
        lifecycleManager.cleanupAllFiles();
        filesRef.current.clear();
        dispatch({ type: "RESET_CONTEXT" });

        // Don't clear IndexedDB automatically - only clear in-memory state
        // IndexedDB should only be cleared when explicitly requested by user
      },
      clearAllData: async () => {
        cancelPendingAdmissions([...pendingAdmissions.current.keys()]);
        clearPdfAccess();
        // First clear all files from memory
        lifecycleManager.cleanupAllFiles();
        filesRef.current.clear();
        dispatch({ type: "RESET_CONTEXT" });

        // Then clear IndexedDB storage
        if (indexedDB && enablePersistence) {
          try {
            await indexedDB.clearAll();
          } catch (error) {
            console.error("Failed to clear IndexedDB:", error);
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
      cleanupFile: (fileId: FileId) =>
        lifecycleManager.cleanupFile(fileId, stateRef),
      scheduleCleanup: (fileId: FileId, delay?: number) =>
        lifecycleManager.scheduleCleanup(fileId, delay, stateRef),
      openEncryptedUnlockPrompt: promptEncryptedUnlock,
    }),
    [
      baseActions,
      addRawFiles,
      addStirlingFileStubsAction,
      reconcileOpenFilesAction,
      lifecycleManager,
      setHasUnsavedChanges,
      consumeFilesWrapper,
      undoConsumeFilesWrapper,
      pinFileWrapper,
      unpinFileWrapper,
      indexedDB,
      enablePersistence,
      promptEncryptedUnlock,
      cancelPendingAdmissions,
    ],
  );

  // Subscription store bridge: the context value is STABLE, so consumers only
  // re-render when the slice they select (via useFileSelector) changes — not on
  // every state change. Listeners are notified after each committed state.
  const listenersRef = useRef<Set<() => void>>(new Set());
  const store = useMemo<FileStateStore>(
    () => ({
      getState: () => stateRef.current,
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      selectors,
    }),
    [selectors],
  );
  // Layout effect (not passive): subscribers re-render before the browser
  // paints, so a state change can never show a frame with stale consumers.
  useLayoutEffect(() => {
    for (const listener of listenersRef.current) listener();
  }, [state]);

  const actionsValue = useMemo<FileContextActionsValue>(
    () => ({
      actions,
      dispatch: dispatchWithUnlock,
    }),
    [actions, dispatchWithUnlock],
  );

  const activeEncryptedStub = activeEncryptedFileId
    ? (pendingAdmissions.current.get(activeEncryptedFileId)?.stub ??
      state.files.byId[activeEncryptedFileId])
    : undefined;
  const isUnlockModalOpen = Boolean(
    activeEncryptedFileId && activeEncryptedStub,
  );

  // Persistence loading disabled - files only loaded on explicit user action
  // useEffect(() => {
  //   if (!enablePersistence || !indexedDB) return;
  //   const loadFromPersistence = async () => { /* loading logic removed */ };
  //   loadFromPersistence();
  // }, [enablePersistence, indexedDB]);

  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // StrictMode can replay effects after files hydrate; only an actual unmount owns cleanup.
      queueMicrotask(() => {
        if (!mountedRef.current) {
          for (const pending of pendingAdmissions.current.values())
            pending.resolve(false);
          pendingAdmissions.current.clear();
          clearPdfAccess();
          lifecycleManager.destroy();
        }
      });
    };
  }, [lifecycleManager]);

  return (
    <FileStoreContext.Provider value={store}>
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
          sessionUnlock
          opened={isUnlockModalOpen}
          fileName={activeEncryptedStub?.name}
          password={unlockPassword}
          errorMessage={unlockError}
          isProcessing={isUnlocking}
          remainingCount={encryptedQueue.length}
          onPasswordChange={setUnlockPassword}
          onUnlock={() => void handleUnlockSubmit()}
          onRemovePassword={() => void handleUnlockSubmit(true)}
          onUnlockAll={handleUnlockAll}
          onSkip={handleUnlockSkip}
        />
      </FileActionsContext.Provider>
    </FileStoreContext.Provider>
  );
}

// Outer provider component that wraps with IndexedDBProvider
export function FileContextProvider({
  children,
  enableUrlSync = true,
  enablePersistence = true,
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
  useFileSelector,
  useFileSelectors,
  useFileIndex,
  shallowEqual,
  useCurrentFile,
  useFileSelection,
  useFileManagement,
  useFileUI,
  useStirlingFileStub,
  useAllFiles,
  useSelectedFiles,
  // Primary API hooks for tools
  useFileContext,
} from "@app/contexts/file/fileHooks";
