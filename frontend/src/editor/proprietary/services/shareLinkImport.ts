import apiClient from "@editor/services/apiClient";
import { fileStorage } from "@editor/services/fileStorage";
import type { FileId } from "@editor/types/file";
import type { StirlingFile } from "@editor/types/fileContext";
import type { FileContextActions } from "@editor/types/fileContext";
import { importShareBundle } from "@editor/services/shareBundleImportService";
import {
  isZipBundle,
  loadShareBundleEntries,
  parseContentDispositionFilename,
  readResponseHeader,
} from "@editor/services/shareBundleUtils";

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

export async function fetchShareLinkMetadata(
  token: string,
): Promise<ShareLinkMetadata> {
  const response = await apiClient.get<ShareLinkMetadata>(
    `/api/v1/storage/share-links/${token}/metadata`,
    {
      suppressErrorToast: true,
      skipAuthRedirect: true,
    },
  );
  return response.data || {};
}

export async function downloadShareLink(token: string): Promise<{
  blob: Blob;
  filename: string;
  contentType: string;
}> {
  const response = await apiClient.get(`/api/v1/storage/share-links/${token}`, {
    responseType: "blob",
    suppressErrorToast: true,
    skipAuthRedirect: true,
  });
  const contentType = readResponseHeader(response.headers, "content-type");
  const disposition = readResponseHeader(
    response.headers,
    "content-disposition",
  );
  const filename =
    parseContentDispositionFilename(disposition) || "shared-file";
  const blob = response.data as Blob;
  const contentTypeValue = contentType || blob.type;
  return { blob, filename, contentType: contentTypeValue };
}

export async function importShareLinkToWorkbench(
  token: string,
  actions: FileContextActions,
  shareMetadata?: ShareLinkMetadata | null,
): Promise<FileId[]> {
  const { blob, filename, contentType } = await downloadShareLink(token);
  const contentTypeValue = contentType || blob.type;

  if (isZipBundle(contentTypeValue, filename)) {
    const bundle = await loadShareBundleEntries(blob);
    if (bundle) {
      const sharedUpdates = {
        remoteStorageId: shareMetadata?.fileId,
        remoteOwnerUsername: shareMetadata?.owner ?? undefined,
        remoteOwnedByCurrentUser: false,
        remoteAccessRole: shareMetadata?.accessRole ?? undefined,
        remoteSharedViaLink: true,
        remoteHasShareLinks: false,
        remoteShareToken: shareMetadata?.shareToken || token,
      };
      const currentFiles = await importShareBundle(
        bundle,
        {
          addFiles: (files) =>
            actions.addFilesWithOptions(files, {
              selectFiles: false,
              autoUnzip: false,
              skipAutoUnzip: false,
              allowDuplicates: true,
            }),
          updateStub: actions.updateStirlingFileStub,
        },
        sharedUpdates,
      );
      return currentFiles.map(({ file }) => file.fileId);
    }
  }

  const file = new File([blob], filename, {
    type: contentTypeValue || blob.type,
  });
  const stirlingFiles = await actions.addFilesWithOptions([file], {
    selectFiles: true,
    autoUnzip: false,
    skipAutoUnzip: false,
  });
  const ids = stirlingFiles.map(
    (stirlingFile: StirlingFile) => stirlingFile.fileId,
  );
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
