import { useState, useCallback } from 'react';
import { useIndexedDB } from '@app/contexts/IndexedDBContext';
import { fileStorage } from '@app/services/fileStorage';
import { StirlingFileStub, StirlingFile } from '@app/types/fileContext';
import { FileId } from '@app/types/fileContext';
import apiClient from '@app/services/apiClient';
import { useAppConfig } from '@app/contexts/AppConfigContext';

interface StoredFileResponse {
  id: number;
  fileName: string;
  contentType?: string | null;
  sizeBytes: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  owner?: string | null;
  ownedByCurrentUser?: boolean;
  shareLinks?: Array<{ token?: string | null }>;
}

interface AccessedShareLinkResponse {
  shareToken?: string | null;
  fileId?: number | null;
  fileName?: string | null;
  owner?: string | null;
  ownedByCurrentUser?: boolean;
  publicLink?: boolean;
  createdAt?: string | null;
  lastAccessedAt?: string | null;
}

export const useFileManager = () => {
  const [loading, setLoading] = useState(false);
  const indexedDB = useIndexedDB();
  const { config } = useAppConfig();

  const normalizeServerFileName = useCallback((fileName: string | undefined | null): string => {
    const fallback = fileName?.trim() || 'server-file';
    const lowerName = fallback.toLowerCase();
    const historySuffix = '-history.zip';
    if (lowerName.endsWith(historySuffix)) {
      return fallback.slice(0, fallback.length - historySuffix.length) || fallback;
    }
    if (lowerName.endsWith('.zip')) {
      const knownInnerExt = [
        'pdf',
        'doc',
        'docx',
        'ppt',
        'pptx',
        'xls',
        'xlsx',
        'png',
        'jpg',
        'jpeg',
        'tif',
        'tiff',
        'txt',
        'csv',
        'rtf',
        'html',
        'epub',
      ];
      for (const ext of knownInnerExt) {
        if (lowerName.endsWith(`.${ext}.zip`)) {
          return fallback.slice(0, fallback.length - 4) || fallback;
        }
      }
    }
    return fallback;
  }, []);

  const convertToFile = useCallback(async (fileStub: StirlingFileStub): Promise<File> => {
    if (!indexedDB) {
      throw new Error('IndexedDB context not available');
    }

    // Regular file loading
    if (fileStub.id) {
      const file = await indexedDB.loadFile(fileStub.id);
      if (file) {
        return file;
      }
    }
    throw new Error(`File not found in storage: ${fileStub.name} (ID: ${fileStub.id})`);
  }, [indexedDB]);

  const loadRecentFiles = useCallback(async (): Promise<StirlingFileStub[]> => {
    setLoading(true);
    try {
      if (!indexedDB) {
        return [];
      }

      // Load only leaf files metadata (processed files that haven't been used as input for other tools)
      const stirlingFileStubs = await fileStorage.getLeafStirlingFileStubs();
      const remoteIdSet = new Set(
        stirlingFileStubs
          .map((stub) => stub.remoteStorageId)
          .filter((id): id is number => typeof id === 'number')
      );
      let combinedStubs = stirlingFileStubs;

      const shouldFetchServerFiles =
        (config?.enableLogin !== false) && (config?.storageEnabled !== false);

      if (shouldFetchServerFiles) {
        try {
          const response = await apiClient.get<StoredFileResponse[]>(
            '/api/v1/storage/files',
            { suppressErrorToast: true, skipAuthRedirect: true } as any
          );
          const serverFiles = Array.isArray(response.data) ? response.data : [];
          const serverStubs: StirlingFileStub[] = [];
          const serverMap = new Map<number, StoredFileResponse>();
          serverFiles.forEach((file) => {
            if (file && typeof file.id === 'number') {
              serverMap.set(file.id, file);
            }
          });

          const updatedLocalStubs = stirlingFileStubs.map((stub) => {
            if (!stub.remoteStorageId) {
              return stub;
            }
            const serverFile = serverMap.get(stub.remoteStorageId);
            if (!serverFile) {
              if (stub.remoteSharedViaLink) {
                return {
                  ...stub,
                  remoteOwnedByCurrentUser: false,
                };
              }
              return {
                ...stub,
                remoteStorageId: undefined,
                remoteStorageUpdatedAt: undefined,
                remoteOwnerUsername: undefined,
                remoteOwnedByCurrentUser: undefined,
                remoteSharedViaLink: false,
                remoteHasShareLinks: undefined,
              };
            }
            const updatedAtMs = serverFile.updatedAt
              ? new Date(serverFile.updatedAt).getTime()
              : serverFile.createdAt
              ? new Date(serverFile.createdAt).getTime()
              : undefined;
            return {
              ...stub,
              remoteOwnerUsername: serverFile.owner ?? stub.remoteOwnerUsername,
              remoteOwnedByCurrentUser:
                typeof serverFile.ownedByCurrentUser === 'boolean'
                  ? serverFile.ownedByCurrentUser
                  : stub.remoteOwnedByCurrentUser,
              remoteSharedViaLink: stub.remoteSharedViaLink,
              remoteHasShareLinks: Boolean(serverFile.shareLinks?.length),
              remoteStorageUpdatedAt:
                typeof updatedAtMs === 'number' && Number.isFinite(updatedAtMs)
                  ? updatedAtMs
                  : stub.remoteStorageUpdatedAt,
            };
          });

          for (const file of serverFiles) {
            if (!file || typeof file.id !== 'number') {
              continue;
            }
            if (remoteIdSet.has(file.id)) {
              continue;
            }
            const updatedAtMs = file.updatedAt
              ? new Date(file.updatedAt).getTime()
              : file.createdAt
              ? new Date(file.createdAt).getTime()
              : Date.now();
            const name = normalizeServerFileName(file.fileName);
            const lastModified = Number.isFinite(updatedAtMs) ? updatedAtMs : Date.now();
            const id = `server-${file.id}` as FileId;
            serverStubs.push({
              id,
              name,
              type: file.contentType || 'application/octet-stream',
              size: file.sizeBytes ?? 0,
              lastModified,
              createdAt: lastModified,
              isLeaf: true,
              originalFileId: id,
              versionNumber: 1,
              toolHistory: [],
              quickKey: `${name}|${file.sizeBytes ?? 0}|${lastModified}`,
              remoteStorageId: file.id,
              remoteStorageUpdatedAt: lastModified,
              remoteOwnerUsername: file.owner ?? undefined,
              remoteOwnedByCurrentUser:
                typeof file.ownedByCurrentUser === 'boolean'
                  ? file.ownedByCurrentUser
                  : undefined,
              remoteSharedViaLink: false,
              remoteHasShareLinks: Boolean(file.shareLinks?.length),
            });
          }

          combinedStubs = [...updatedLocalStubs, ...serverStubs];
        } catch (error) {
          console.warn('Failed to load server files:', error);
        }

        try {
          const sharedResponse = await apiClient.get<AccessedShareLinkResponse[]>(
            '/api/v1/storage/share-links/accessed',
            { suppressErrorToast: true, skipAuthRedirect: true } as any
          );
          const sharedLinks = Array.isArray(sharedResponse.data) ? sharedResponse.data : [];
          const allowedShareTokens = new Set(
            sharedLinks
              .map((link) => link.shareToken)
              .filter((token): token is string => Boolean(token))
          );
          const shareClearUpdates: Array<Promise<void>> = [];
          combinedStubs = combinedStubs.map((stub) => {
            if (
              stub.remoteSharedViaLink &&
              stub.remoteShareToken &&
              !allowedShareTokens.has(stub.remoteShareToken)
            ) {
              const cleared = {
                ...stub,
                remoteStorageId: undefined,
                remoteStorageUpdatedAt: undefined,
                remoteOwnerUsername: undefined,
                remoteOwnedByCurrentUser: undefined,
                remoteSharedViaLink: false,
                remoteHasShareLinks: undefined,
                remoteShareToken: undefined,
              };
              shareClearUpdates.push(
                fileStorage.updateFileMetadata(stub.id, {
                  remoteStorageId: undefined,
                  remoteStorageUpdatedAt: undefined,
                  remoteOwnerUsername: undefined,
                  remoteOwnedByCurrentUser: undefined,
                  remoteSharedViaLink: false,
                  remoteHasShareLinks: undefined,
                  remoteShareToken: undefined,
                })
              );
              return cleared;
            }
            return stub;
          });
          if (shareClearUpdates.length > 0) {
            await Promise.all(shareClearUpdates);
          }
          const existingShareTokens = new Set(
            combinedStubs
              .map((stub) => stub.remoteShareToken)
              .filter((token): token is string => Boolean(token))
          );
          const sharedStubs: StirlingFileStub[] = [];

          for (const link of sharedLinks) {
            if (!link || !link.shareToken) {
              continue;
            }
            if (existingShareTokens.has(link.shareToken)) {
              continue;
            }
            const createdAtMs = link.lastAccessedAt
              ? new Date(link.lastAccessedAt).getTime()
              : link.createdAt
              ? new Date(link.createdAt).getTime()
              : Date.now();
            const lastModified = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
            const name = normalizeServerFileName(link.fileName || 'shared-file');
            const id = `shared-${link.shareToken}` as FileId;
            sharedStubs.push({
              id,
              name,
              type: 'application/octet-stream',
              size: 0,
              lastModified,
              createdAt: lastModified,
              isLeaf: true,
              originalFileId: id,
              versionNumber: 1,
              toolHistory: [],
              quickKey: `${name}|0|${lastModified}`,
              remoteStorageId: link.fileId ?? undefined,
              remoteStorageUpdatedAt: lastModified,
              remoteOwnerUsername: link.owner ?? undefined,
              remoteOwnedByCurrentUser: false,
              remoteSharedViaLink: true,
              remoteHasShareLinks: false,
              remoteShareToken: link.shareToken,
            });
          }

          combinedStubs = [...combinedStubs, ...sharedStubs];
        } catch (error) {
          console.warn('Failed to load shared links:', error);
        }
      }

      // For now, only regular files - drafts will be handled separately in the future
      const sortedFiles = combinedStubs.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

      return sortedFiles;
    } catch (error) {
      console.error('Failed to load recent files:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [indexedDB, config?.enableLogin, config?.storageEnabled, normalizeServerFileName]);

  const handleRemoveFile = useCallback(async (index: number, files: StirlingFileStub[], setFiles: (files: StirlingFileStub[]) => void) => {
    const file = files[index];
    if (!file.id) {
      throw new Error('File ID is required for removal');
    }
    if (!indexedDB) {
      throw new Error('IndexedDB context not available');
    }
    try {
      await indexedDB.deleteFile(file.id);
      setFiles(files.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Failed to remove file:', error);
      throw error;
    }
  }, [indexedDB]);

  const storeFile = useCallback(async (file: File, fileId: FileId) => {
    if (!indexedDB) {
      throw new Error('IndexedDB context not available');
    }
    try {
      // Store file with provided UUID from FileContext (thumbnail generated internally)
      const metadata = await indexedDB.saveFile(file, fileId);

      // Convert file to ArrayBuffer for storage compatibility
      const arrayBuffer = await file.arrayBuffer();

      // This method is deprecated - use FileStorage directly instead
      return {
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        data: arrayBuffer,
        thumbnail: metadata.thumbnailUrl
      };
    } catch (error) {
      console.error('Failed to store file:', error);
      throw error;
    }
  }, [indexedDB]);

  const createFileSelectionHandlers = useCallback((
    selectedFiles: FileId[],
    setSelectedFiles: (files: FileId[]) => void
  ) => {
    const toggleSelection = (fileId: FileId) => {
      setSelectedFiles(
        selectedFiles.includes(fileId)
          ? selectedFiles.filter(id => id !== fileId)
          : [...selectedFiles, fileId]
      );
    };

    const clearSelection = () => {
      setSelectedFiles([]);
    };

    const selectMultipleFiles = async (files: StirlingFileStub[], onStirlingFilesSelect: (stirlingFiles: StirlingFile[]) => void) => {
      if (selectedFiles.length === 0) return;

      try {
        // Filter by UUID and load full StirlingFile objects directly
        const selectedFileObjects = files.filter(f => selectedFiles.includes(f.id));

        const stirlingFiles = await Promise.all(
          selectedFileObjects.map(async (stub) => {
            const stirlingFile = await fileStorage.getStirlingFile(stub.id);
            if (!stirlingFile) {
              throw new Error(`File not found in storage: ${stub.name}`);
            }
            return stirlingFile;
          })
        );

        onStirlingFilesSelect(stirlingFiles);
        clearSelection();
      } catch (error) {
        console.error('Failed to load selected files:', error);
        throw error;
      }
    };

    return {
      toggleSelection,
      clearSelection,
      selectMultipleFiles
    };
  }, [convertToFile]);

  const touchFile = useCallback(async (id: FileId) => {
    if (!indexedDB) {
      console.warn('IndexedDB context not available for touch operation');
      return;
    }
    try {
      // Update access time - this will be handled by the cache in IndexedDBContext
      // when the file is loaded, so we can just load it briefly to "touch" it
      await indexedDB.loadFile(id);
    } catch (error) {
      console.error('Failed to touch file:', error);
    }
  }, [indexedDB]);

  return {
    loading,
    convertToFile,
    loadRecentFiles,
    handleRemoveFile,
    storeFile,
    touchFile,
    createFileSelectionHandlers
  };
};
