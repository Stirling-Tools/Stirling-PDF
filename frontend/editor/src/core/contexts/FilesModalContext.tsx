import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useFileActions } from "@app/contexts/FileContext";
import { useFileContext } from "@app/contexts/file/fileHooks";
import {
  useNavigationActions,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import { StirlingFileStub } from "@app/types/fileContext";
import { isPageEditorWorkbench } from "@app/types/workbench";
import type { FileId } from "@app/types/file";
import { fileStorage } from "@app/services/fileStorage";
import apiClient from "@app/services/apiClient";
import {
  extractLatestFilesFromBundle,
  getShareBundleEntryRootId,
  isZipBundle,
  loadShareBundleEntries,
  parseContentDispositionFilename,
  readResponseHeader,
} from "@app/services/shareBundleUtils";

type CustomFileHandler = (
  files: File[],
  insertAfterPage?: number,
) => void | Promise<void>;

interface FilesModalOptions {
  insertAfterPage?: number;
  customHandler?: CustomFileHandler;
  maxSelectable?: number | null;
}

interface FilesModalContextType {
  isFilesModalOpen: boolean;
  openFilesModal: (options?: FilesModalOptions) => void;
  closeFilesModal: () => void;
  maxSelectable: number | null;
  /** Closes the picker before ingestion; rejects on import failure. */
  onFileUpload: (files: File[]) => Promise<void>;
  /** Imports readable selections before rejecting with unavailable filenames; leaves modal state unchanged. */
  onRecentFileSelect: (
    stirlingFileStubs: StirlingFileStub[],
    uploads?: File[],
  ) => Promise<void>;
  /** Reads inputs in selection order without changing the workspace; rejects if any file is unavailable. */
  loadFiles: (stubs: StirlingFileStub[]) => Promise<File[]>;
  onModalClose?: () => void;
  setOnModalClose: (callback: () => void) => void;
}

export const FilesModalContext = createContext<FilesModalContextType | null>(
  null,
);

export const FilesModalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { t } = useTranslation();
  const { addFiles } = useFileHandler();
  const { actions } = useFileActions();
  const fileCtx = useFileContext();
  const { actions: navActions } = useNavigationActions();
  const { workbench: currentWorkbench } = useNavigationState();
  // Both page editors lay out every open file, so an added file belongs there.
  const staysOnAdd = isPageEditorWorkbench(currentWorkbench);
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [onModalClose, setOnModalClose] = useState<(() => void) | undefined>();
  const [insertAfterPage, setInsertAfterPage] = useState<number | undefined>();
  const [customHandler, setCustomHandler] = useState<CustomFileHandler>();
  const [maxSelectable, setMaxSelectable] = useState<number | null>(null);

  const importBundleToWorkbench = useCallback(
    async (
      blob: Blob,
      filename: string,
      contentType: string,
      remoteStorageId?: number,
      remoteStorageUpdatedAt?: number,
      remoteOwnerUsername?: string,
      remoteOwnedByCurrentUser?: boolean,
      remoteSharedViaLink?: boolean,
      remoteShareToken?: string,
    ): Promise<FileId[]> => {
      const bundle = isZipBundle(contentType, filename)
        ? await loadShareBundleEntries(blob)
        : null;
      if (bundle) {
        const { manifest, rootOrder, sortedEntries, files } = bundle;

        const stirlingFiles = await actions.addFilesWithOptions(files, {
          selectFiles: false,
          autoUnzip: false,
          skipAutoUnzip: false,
          allowDuplicates: true,
        });

        const idMap = new Map<string, FileId>();
        for (let i = 0; i < stirlingFiles.length; i += 1) {
          idMap.set(
            sortedEntries[i].logicalId,
            stirlingFiles[i].fileId as FileId,
          );
        }

        const rootIdMap = new Map<string, FileId>();
        for (const rootLogicalId of rootOrder) {
          const mappedId = idMap.get(rootLogicalId);
          if (mappedId) {
            rootIdMap.set(rootLogicalId, mappedId);
          }
        }

        const remoteUpdatedAt = remoteStorageUpdatedAt ?? Date.now();
        for (const entry of sortedEntries) {
          const newId = idMap.get(entry.logicalId);
          if (!newId) continue;
          const parentId = entry.parentLogicalId
            ? idMap.get(entry.parentLogicalId)
            : undefined;
          const rootId =
            rootIdMap.get(getShareBundleEntryRootId(manifest, entry)) ||
            idMap.get(manifest.rootLogicalId) ||
            newId;
          const updates = {
            versionNumber: entry.versionNumber,
            originalFileId: rootId,
            parentFileId: parentId,
            toolHistory: entry.toolHistory,
            isLeaf: entry.isLeaf,
            remoteStorageId,
            remoteStorageUpdatedAt: remoteUpdatedAt,
            remoteOwnerUsername,
            remoteOwnedByCurrentUser,
            remoteSharedViaLink,
            remoteShareToken,
          };
          actions.updateStirlingFileStub(newId, updates);
          await fileStorage.updateFileMetadata(newId, updates);
        }

        const selectedIds: FileId[] = [];
        for (const rootId of rootOrder) {
          const rootEntries = sortedEntries.filter(
            (entry) => getShareBundleEntryRootId(manifest, entry) === rootId,
          );
          const latestEntry = rootEntries[rootEntries.length - 1];
          if (!latestEntry) {
            continue;
          }
          const latestId = idMap.get(latestEntry.logicalId);
          if (latestId) {
            selectedIds.push(latestId);
          }
        }

        return selectedIds;
      }

      const file = new File([blob], filename, {
        type: contentType || blob.type,
      });
      const stirlingFiles = await actions.addFilesWithOptions([file], {
        selectFiles: false,
        autoUnzip: false,
        skipAutoUnzip: false,
        allowDuplicates: true,
      });
      const fileId = stirlingFiles[0]?.fileId as FileId | undefined;
      if (fileId && remoteStorageId) {
        const remoteUpdatedAt = remoteStorageUpdatedAt ?? Date.now();
        const updates = {
          remoteStorageId,
          remoteStorageUpdatedAt: remoteUpdatedAt,
          remoteOwnerUsername,
          remoteOwnedByCurrentUser,
          remoteSharedViaLink,
          remoteShareToken,
        };
        actions.updateStirlingFileStub(fileId, updates);
        await fileStorage.updateFileMetadata(fileId, updates);
      }
      return fileId ? [fileId] : [];
    },
    [actions, fileStorage],
  );

  const downloadRemoteFile = useCallback(async (stub: StirlingFileStub) => {
    const path = stub.remoteShareToken
      ? `/api/v1/storage/share-links/${stub.remoteShareToken}`
      : stub.remoteStorageId && stub.id.startsWith("server-")
        ? `/api/v1/storage/files/${stub.remoteStorageId}/download`
        : null;
    if (!path) return null;
    const response = await apiClient.get(path, {
      responseType: "blob",
      suppressErrorToast: true,
      skipAuthRedirect: true,
    });
    const contentType = readResponseHeader(response.headers, "content-type");
    const disposition = readResponseHeader(
      response.headers,
      "content-disposition",
    );
    const filename = parseContentDispositionFilename(disposition) || stub.name;
    const blob = response.data as Blob;
    const contentTypeValue = contentType || blob.type;
    return { blob, filename, contentType: contentTypeValue };
  }, []);

  const openFilesModal = useCallback((options?: FilesModalOptions) => {
    setInsertAfterPage(options?.insertAfterPage);
    setCustomHandler(() => options?.customHandler);
    setMaxSelectable(options?.maxSelectable ?? null);
    setIsFilesModalOpen(true);
  }, []);

  const closeFilesModal = useCallback(() => {
    setIsFilesModalOpen(false);
    setInsertAfterPage(undefined);
    setCustomHandler(undefined);
    onModalClose?.();
  }, [onModalClose]);

  const loadFiles = useCallback(
    async (stirlingFileStubs: StirlingFileStub[]) => {
      const loadedFiles: File[] = [];
      for (const stub of stirlingFileStubs) {
        const remote = await downloadRemoteFile(stub);
        if (remote) {
          loadedFiles.push(
            ...(await extractLatestFilesFromBundle(
              remote.blob,
              remote.filename,
              remote.contentType,
            )),
          );
        } else {
          const file = await fileStorage.getStirlingFile(stub.id);
          if (!file) throw new Error(`${stub.name} is no longer available.`);
          loadedFiles.push(file);
        }
      }
      return loadedFiles;
    },
    [downloadRemoteFile],
  );

  const handleRecentFileSelect = useCallback(
    async (stirlingFileStubs: StirlingFileStub[], uploads: File[] = []) => {
      const failedNames: string[] = [];
      const reportUnavailable = () => {
        if (failedNames.length)
          throw new Error(
            t("filePicker.filesUnavailable", "Could not add: {{names}}", {
              names: failedNames.join(", "),
            }),
          );
      };
      if (customHandler) {
        const loadedFiles: File[] = [];
        for (const stub of stirlingFileStubs) {
          try {
            loadedFiles.push(...(await loadFiles([stub])));
          } catch (cause) {
            console.error("Could not load selected file", stub.name, cause);
            failedNames.push(stub.name);
          }
        }
        const files = [...loadedFiles, ...uploads];
        if (files.length) await customHandler(files, insertAfterPage);
        reportUnavailable();
        return;
      }
      if (uploads.length > 0) await addFiles(uploads);

      const localStubs: StirlingFileStub[] = [];
      const requestedIds: FileId[] = [];
      for (const stub of stirlingFileStubs) {
        try {
          const remote = await downloadRemoteFile(stub);
          if (!remote) {
            localStubs.push(stub);
            requestedIds.push(stub.id);
            continue;
          }
          const importedIds = await importBundleToWorkbench(
            remote.blob,
            remote.filename,
            remote.contentType,
            stub.remoteStorageId,
            stub.remoteStorageUpdatedAt,
            stub.remoteOwnerUsername,
            stub.remoteOwnedByCurrentUser,
            stub.remoteShareToken ? true : stub.remoteSharedViaLink,
            stub.remoteShareToken,
          );
          requestedIds.push(...importedIds);
        } catch (cause) {
          console.error("Could not import selected file", stub.name, cause);
          failedNames.push(stub.name);
        }
      }

      if (localStubs.length)
        await actions.addStirlingFileStubs(localStubs, { selectFiles: false });
      // Adding an input must preserve a tool's existing selection.
      const uploadedIds = uploads
        .map((file) => fileCtx.findFileId(file))
        .filter((id): id is FileId => Boolean(id));
      const currentSelected = fileCtx.selectors
        .getSelectedStirlingFileStubs()
        .map((s) => s.id);
      actions.setSelectedFiles(
        Array.from(
          new Set([...currentSelected, ...requestedIds, ...uploadedIds]),
        ),
      );

      const totalAdded = requestedIds.length + uploads.length;
      if (!staysOnAdd && totalAdded > 0) {
        navActions.setWorkbench(totalAdded === 1 ? "viewer" : "fileEditor");
      }
      reportUnavailable();
    },
    [
      addFiles,
      loadFiles,
      actions,
      customHandler,
      insertAfterPage,
      fileCtx,
      downloadRemoteFile,
      importBundleToWorkbench,
      navActions,
      staysOnAdd,
      t,
    ],
  );

  const handleFileUpload = useCallback(
    (files: File[]) => {
      closeFilesModal();
      return handleRecentFileSelect([], files);
    },
    [closeFilesModal, handleRecentFileSelect],
  );

  const setModalCloseCallback = useCallback((callback: () => void) => {
    setOnModalClose(() => callback);
  }, []);

  const contextValue: FilesModalContextType = useMemo(
    () => ({
      isFilesModalOpen,
      openFilesModal,
      closeFilesModal,
      onFileUpload: handleFileUpload,
      onRecentFileSelect: handleRecentFileSelect,
      loadFiles,
      onModalClose,
      setOnModalClose: setModalCloseCallback,
      maxSelectable,
    }),
    [
      isFilesModalOpen,
      openFilesModal,
      closeFilesModal,
      handleFileUpload,
      handleRecentFileSelect,
      loadFiles,
      onModalClose,
      setModalCloseCallback,
      maxSelectable,
    ],
  );

  return (
    <FilesModalContext.Provider value={contextValue}>
      {children}
    </FilesModalContext.Provider>
  );
};

export const useFilesModalContext = () => {
  const context = useContext(FilesModalContext);
  if (!context) {
    throw new Error(
      "useFilesModalContext must be used within FilesModalProvider",
    );
  }
  return context;
};
