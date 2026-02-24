import apiClient from '@app/services/apiClient';
import { fileStorage } from '@app/services/fileStorage';
import type { FileId } from '@app/types/file';
import type { StirlingFile } from '@app/types/fileContext';
import type { FileContextActionsValue } from '@app/contexts/file/contexts';
import {
  getShareBundleEntryRootId,
  isZipBundle,
  loadShareBundleEntries,
  parseContentDispositionFilename,
} from '@app/services/shareBundleUtils';

export interface ShareLinkMetadata {
  shareToken?: string;
  fileId?: number;
  fileName?: string;
  owner?: string | null;
  ownedByCurrentUser?: boolean;
  accessRole?: string | null;
  createdAt?: string;
  expiresAt?: string;
}

export async function fetchShareLinkMetadata(token: string): Promise<ShareLinkMetadata> {
  const response = await apiClient.get<ShareLinkMetadata>(
    `/api/v1/storage/share-links/${token}/metadata`,
    { suppressErrorToast: true, skipAuthRedirect: true } as any
  );
  return response.data || {};
}

export async function downloadShareLink(token: string): Promise<{
  blob: Blob;
  filename: string;
  contentType: string;
}> {
  const response = await apiClient.get(`/api/v1/storage/share-links/${token}`, {
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
  const filename = parseContentDispositionFilename(disposition) || 'shared-file';
  const blob = response.data as Blob;
  const contentTypeValue = contentType || blob.type;
  return { blob, filename, contentType: contentTypeValue };
}

export async function importShareLinkToWorkbench(
  token: string,
  actions: FileContextActionsValue,
  shareMetadata?: ShareLinkMetadata | null
): Promise<FileId[]> {
  const { blob, filename, contentType } = await downloadShareLink(token);
  const contentTypeValue = contentType || blob.type;

  if (isZipBundle(contentTypeValue, filename)) {
    const bundle = await loadShareBundleEntries(blob);
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
        idMap.set(sortedEntries[i].logicalId, stirlingFiles[i].fileId as FileId);
      }

      const rootIdMap = new Map<string, FileId>();
      for (const rootLogicalId of rootOrder) {
        const mappedId = idMap.get(rootLogicalId);
        if (mappedId) {
          rootIdMap.set(rootLogicalId, mappedId);
        }
      }

      const sharedUpdates = {
        remoteStorageId: shareMetadata?.fileId,
        remoteOwnerUsername: shareMetadata?.owner ?? undefined,
        remoteOwnedByCurrentUser: false,
        remoteAccessRole: shareMetadata?.accessRole ?? undefined,
        remoteSharedViaLink: true,
        remoteHasShareLinks: false,
        remoteShareToken: shareMetadata?.shareToken || token,
      };

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
          ...sharedUpdates,
        };
        actions.updateStirlingFileStub(newId, updates);
        await fileStorage.updateFileMetadata(newId, updates);
      }

      const selectedIds: FileId[] = [];
      for (const rootId of rootOrder) {
        const rootEntries = sortedEntries.filter(
          (entry) => getShareBundleEntryRootId(manifest, entry) === rootId
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

  const file = new File([blob], filename, { type: contentTypeValue || blob.type });
  const stirlingFiles = await actions.addFilesWithOptions([file], {
    selectFiles: true,
    autoUnzip: false,
    skipAutoUnzip: false,
  });
  const ids = stirlingFiles.map((stirlingFile: StirlingFile) => stirlingFile.fileId as FileId);
  if (ids.length > 0) {
    const sharedUpdates = {
      remoteStorageId: shareMetadata?.fileId,
      remoteOwnerUsername: shareMetadata?.owner ?? undefined,
      remoteOwnedByCurrentUser: false,
      remoteAccessRole: shareMetadata?.accessRole ?? undefined,
      remoteSharedViaLink: true,
      remoteHasShareLinks: false,
      remoteShareToken: shareMetadata?.shareToken || token,
    };
    for (const fileId of ids) {
      actions.updateStirlingFileStub(fileId, sharedUpdates);
      await fileStorage.updateFileMetadata(fileId, sharedUpdates);
    }
  }

  return ids;
}
