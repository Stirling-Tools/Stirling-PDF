import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import JSZip from 'jszip';
import { useFileHandler } from '@app/hooks/useFileHandler';
import { useFileActions } from '@app/contexts/FileContext';
import { useFileContext } from '@app/contexts/file/fileHooks';
import { StirlingFileStub } from '@app/types/fileContext';
import type { FileId } from '@app/types/file';
import { fileStorage } from '@app/services/fileStorage';
import apiClient from '@app/services/apiClient';
import type { ShareBundleManifest } from '@app/services/serverStorageBundle';
import { alert } from '@app/components/toast';

interface FilesModalContextType {
  isFilesModalOpen: boolean;
  openFilesModal: (options?: { insertAfterPage?: number; customHandler?: (files: File[], insertAfterPage?: number) => void }) => void;
  closeFilesModal: () => void;
  onFileUpload: (files: File[]) => void;
  onRecentFileSelect: (stirlingFileStubs: StirlingFileStub[]) => void;
  onModalClose?: () => void;
  setOnModalClose: (callback: () => void) => void;
}

const FilesModalContext = createContext<FilesModalContextType | null>(null);

export const FilesModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addFiles } = useFileHandler();
  const { actions } = useFileActions();
  const fileCtx = useFileContext();
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [onModalClose, setOnModalClose] = useState<(() => void) | undefined>();
  const [insertAfterPage, setInsertAfterPage] = useState<number | undefined>();
  const [customHandler, setCustomHandler] = useState<((files: File[], insertAfterPage?: number) => void) | undefined>();

  const parseFilename = useCallback((disposition: string | undefined): string | null => {
    if (!disposition) return null;
    const filenameMatch = /filename="([^"]+)"/i.exec(disposition);
    if (filenameMatch?.[1]) return filenameMatch[1];
    const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        return utf8Match[1];
      }
    }
    return null;
  }, []);

  const extractLatestFilesFromBundle = useCallback(async (blob: Blob, filename: string, contentType: string): Promise<File[]> => {
    const isZip = contentType.includes('zip') || filename.toLowerCase().endsWith('.zip');
    if (!isZip) {
      return [new File([blob], filename, { type: contentType || blob.type })];
    }

    const zip = await JSZip.loadAsync(blob);
    const manifestEntry = zip.file('stirling-share.json');
    if (!manifestEntry) {
      return [new File([blob], filename, { type: contentType || blob.type })];
    }

    const manifestText = await manifestEntry.async('text');
    const manifest = JSON.parse(manifestText) as ShareBundleManifest;
    const entryRootId = (entry: ShareBundleManifest['entries'][number]) =>
      entry.rootLogicalId || manifest.rootLogicalId;
    const rootOrder =
      manifest.rootLogicalIds && manifest.rootLogicalIds.length > 0
        ? manifest.rootLogicalIds
        : Array.from(new Set(manifest.entries.map(entryRootId)));

    const latestFiles: File[] = [];
    for (const rootId of rootOrder) {
      const rootEntries = manifest.entries
        .filter((entry) => entryRootId(entry) === rootId)
        .sort((a, b) => a.versionNumber - b.versionNumber);
      const latestEntry = rootEntries[rootEntries.length - 1];
      if (!latestEntry) continue;
      const zipEntry = zip.file(latestEntry.filePath);
      if (!zipEntry) continue;
      const fileBlob = await zipEntry.async('blob');
      latestFiles.push(
        new File([fileBlob], latestEntry.name, {
          type: latestEntry.type,
          lastModified: latestEntry.lastModified,
        })
      );
    }

    if (latestFiles.length > 0) {
      return latestFiles;
    }

    return [new File([blob], filename, { type: contentType || blob.type })];
  }, []);

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
      remoteShareToken?: string
    ): Promise<FileId[]> => {
      const isZip = contentType.includes('zip') || filename.toLowerCase().endsWith('.zip');
      if (isZip) {
        const zip = await JSZip.loadAsync(blob);
        const manifestEntry = zip.file('stirling-share.json');
        if (manifestEntry) {
          const manifestText = await manifestEntry.async('text');
          const manifest = JSON.parse(manifestText) as ShareBundleManifest;
          const entryRootId = (entry: ShareBundleManifest['entries'][number]) =>
            entry.rootLogicalId || manifest.rootLogicalId;
          const rootOrder =
            manifest.rootLogicalIds && manifest.rootLogicalIds.length > 0
              ? manifest.rootLogicalIds
              : Array.from(new Set(manifest.entries.map(entryRootId)));
          const sortedEntries: ShareBundleManifest['entries'] = [];
          for (const rootId of rootOrder) {
            const rootEntries = manifest.entries
              .filter((entry) => entryRootId(entry) === rootId)
              .sort((a, b) => a.versionNumber - b.versionNumber);
            sortedEntries.push(...rootEntries);
          }

          const files: File[] = [];
          for (const entry of sortedEntries) {
            const zipEntry = zip.file(entry.filePath);
            if (!zipEntry) {
              throw new Error(`Missing file entry ${entry.filePath}`);
            }
            const fileBlob = await zipEntry.async('blob');
            files.push(
              new File([fileBlob], entry.name, {
                type: entry.type,
                lastModified: entry.lastModified,
              })
            );
          }

          const stirlingFiles = await actions.addFilesWithOptions(files, {
            selectFiles: false,
            autoUnzip: false,
            skipAutoUnzip: false,
            allowDuplicates: true,
          });

          const idMap = new Map<string, FileId>();
          for (let i = 0; i < stirlingFiles.length; i += 1) {
            idMap.set(sortedEntries[i].logicalId, stirlingFiles[i].fileId as FileId);
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
              rootIdMap.get(entryRootId(entry)) ||
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
              (entry) => entryRootId(entry) === rootId
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
      }

      const file = new File([blob], filename, { type: contentType || blob.type });
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
    [actions, fileStorage]
  );

  const downloadServerFile = useCallback(async (remoteId: number) => {
    const response = await apiClient.get(`/api/v1/storage/files/${remoteId}/download`, {
      responseType: 'blob',
      suppressErrorToast: true,
      skipAuthRedirect: true,
    } as any);
    const contentType =
      (response.headers && (response.headers['content-type'] || response.headers['Content-Type'])) ||
      '';
    const disposition =
      (response.headers &&
        (response.headers['content-disposition'] || response.headers['Content-Disposition'])) ||
      '';
    const filename = parseFilename(disposition) || 'server-file';
    const blob = response.data as Blob;
    const contentTypeValue = contentType || blob.type;
    return { blob, filename, contentType: contentTypeValue };
  }, [parseFilename]);

  const downloadShareLinkFile = useCallback(async (shareToken: string) => {
    const response = await apiClient.get(`/api/v1/storage/share-links/${shareToken}`, {
      responseType: 'blob',
      suppressErrorToast: true,
      skipAuthRedirect: true,
    } as any);
    const contentType =
      (response.headers && (response.headers['content-type'] || response.headers['Content-Type'])) ||
      '';
    const disposition =
      (response.headers &&
        (response.headers['content-disposition'] || response.headers['Content-Disposition'])) ||
      '';
    const filename = parseFilename(disposition) || 'shared-file';
    const blob = response.data as Blob;
    const contentTypeValue = contentType || blob.type;
    return { blob, filename, contentType: contentTypeValue };
  }, [parseFilename]);

  const openFilesModal = useCallback((options?: { insertAfterPage?: number; customHandler?: (files: File[], insertAfterPage?: number) => void }) => {
    setInsertAfterPage(options?.insertAfterPage);
    setCustomHandler(() => options?.customHandler);
    setIsFilesModalOpen(true);
  }, []);

  const closeFilesModal = useCallback(() => {
    setIsFilesModalOpen(false);
    setInsertAfterPage(undefined); // Clear insertion position
    setCustomHandler(undefined); // Clear custom handler
    onModalClose?.();
  }, [onModalClose]);

  const handleFileUpload = useCallback(async (files: File[]) => {
    if (customHandler) {
      // Use custom handler for special cases (like page insertion)
      customHandler(files, insertAfterPage);
    } else {
      // 1) Add via standard flow (auto-selects new files)
      await addFiles(files);
      // 2) Merge all requested file IDs (covers already-present files too)
      const ids = files
        .map((f) => fileCtx.findFileId(f) as FileId | undefined)
        .filter((id): id is FileId => Boolean(id));
      if (ids.length > 0) {
        const currentSelected = fileCtx.selectors.getSelectedStirlingFileStubs().map((s) => s.id);
        const nextSelection = Array.from(new Set([...currentSelected, ...ids]));
        actions.setSelectedFiles(nextSelection);
      }
    }
    closeFilesModal();
  }, [addFiles, closeFilesModal, insertAfterPage, customHandler, actions, fileCtx]);

  const handleRecentFileSelect = useCallback(async (stirlingFileStubs: StirlingFileStub[]) => {
    const serverOnlyStubs = stirlingFileStubs.filter(
      (stub) => stub.remoteStorageId && stub.id.startsWith('server-')
    );
    const sharedLinkStubs = stirlingFileStubs.filter(
      (stub) => stub.remoteShareToken
    );
    const localStubs = stirlingFileStubs.filter(
      (stub) => !serverOnlyStubs.includes(stub) && !sharedLinkStubs.includes(stub)
    );

    if (customHandler) {
      try {
        const loadedFiles: File[] = [];
        for (const stub of localStubs) {
          const stirlingFile = await fileStorage.getStirlingFile(stub.id);
          if (stirlingFile) {
            loadedFiles.push(stirlingFile);
          }
        }
        for (const stub of serverOnlyStubs) {
          if (!stub.remoteStorageId) continue;
          const { blob, filename, contentType } = await downloadServerFile(stub.remoteStorageId);
          const latestFiles = await extractLatestFilesFromBundle(blob, filename, contentType);
          loadedFiles.push(...latestFiles);
        }
        for (const stub of sharedLinkStubs) {
          if (!stub.remoteShareToken) continue;
          const { blob, filename, contentType } = await downloadShareLinkFile(stub.remoteShareToken);
          const latestFiles = await extractLatestFilesFromBundle(blob, filename, contentType);
          loadedFiles.push(...latestFiles);
        }

        if (loadedFiles.length > 0) {
          customHandler(loadedFiles, insertAfterPage);
        }
      } catch (error) {
        console.error('Failed to load files for custom handler:', error);
        alert({
          alertType: 'error',
          title: 'Unable to download one or more server files.',
          expandable: false,
          durationMs: 3500,
        });
      }
      closeFilesModal();
      return;
    }

    const selectedFromServer: FileId[] = [];
    try {
      for (const stub of serverOnlyStubs) {
        if (!stub.remoteStorageId) continue;
        const { blob, filename, contentType } = await downloadServerFile(stub.remoteStorageId);
        const importedIds = await importBundleToWorkbench(
          blob,
          filename,
          contentType,
          stub.remoteStorageId,
          stub.remoteStorageUpdatedAt,
          stub.remoteOwnerUsername,
          stub.remoteOwnedByCurrentUser,
          stub.remoteSharedViaLink,
          stub.remoteShareToken
        );
        selectedFromServer.push(...importedIds);
      }
      for (const stub of sharedLinkStubs) {
        if (!stub.remoteShareToken) continue;
        const { blob, filename, contentType } = await downloadShareLinkFile(stub.remoteShareToken);
        const importedIds = await importBundleToWorkbench(
          blob,
          filename,
          contentType,
          stub.remoteStorageId,
          stub.remoteStorageUpdatedAt,
          stub.remoteOwnerUsername,
          stub.remoteOwnedByCurrentUser,
          true,
          stub.remoteShareToken
        );
        selectedFromServer.push(...importedIds);
      }
    } catch (error) {
      console.error('Failed to load server files:', error);
      alert({
        alertType: 'error',
        title: 'Unable to download one or more server files.',
        expandable: false,
        durationMs: 3500,
      });
    }

    if (actions.addStirlingFileStubs) {
      await actions.addStirlingFileStubs(localStubs, { selectFiles: false });
      const requestedIds = localStubs.map((s) => s.id);
      const nextSelection = Array.from(
        new Set([...requestedIds, ...selectedFromServer])
      );
      actions.setSelectedFiles(nextSelection);
    } else {
      console.error('addStirlingFileStubs action not available');
    }

    closeFilesModal();
  }, [
    actions.addStirlingFileStubs,
    actions,
    closeFilesModal,
    customHandler,
    insertAfterPage,
    fileCtx,
    downloadServerFile,
    downloadShareLinkFile,
    extractLatestFilesFromBundle,
    importBundleToWorkbench,
  ]);

  const setModalCloseCallback = useCallback((callback: () => void) => {
    setOnModalClose(() => callback);
  }, []);

  const contextValue: FilesModalContextType = useMemo(() => ({
    isFilesModalOpen,
    openFilesModal,
    closeFilesModal,
    onFileUpload: handleFileUpload,
    onRecentFileSelect: handleRecentFileSelect,
    onModalClose,
    setOnModalClose: setModalCloseCallback,
  }), [
    isFilesModalOpen,
    openFilesModal,
    closeFilesModal,
    handleFileUpload,
    handleRecentFileSelect,
    onModalClose,
    setModalCloseCallback,
  ]);

  return (
    <FilesModalContext.Provider value={contextValue}>
      {children}
    </FilesModalContext.Provider>
  );
};

export const useFilesModalContext = () => {
  const context = useContext(FilesModalContext);
  if (!context) {
    throw new Error('useFilesModalContext must be used within FilesModalProvider');
  }
  return context;
};
