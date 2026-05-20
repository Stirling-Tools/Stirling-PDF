/**
 * Reconciles the local IDB file stub list with the server's view of which
 * files the user can see. Server is source of truth for cloud files; local
 * IDB caches them so the grid renders instantly while the server call is in
 * flight and so local-only files survive offline.
 */

import apiClient from "@app/services/apiClient";
import { fileStorage } from "@app/services/fileStorage";
import { StirlingFileStub } from "@app/types/fileContext";
import { FileId } from "@app/types/fileContext";

interface StoredFileResponse {
  id: number;
  fileName: string;
  contentType?: string | null;
  sizeBytes: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  owner?: string | null;
  ownedByCurrentUser?: boolean;
  accessRole?: string | null;
  shareLinks?: Array<{ token?: string | null }>;
  filePurpose?: string | null;
  folderId?: string | null;
}

interface AccessedShareLinkResponse {
  shareToken?: string | null;
  fileId?: number | null;
}

export interface ReconcileOptions {
  storageEnabled: boolean;
  shareLinksEnabled: boolean;
}

function normalizeServerFileName(fileName: string | undefined | null): string {
  const fallback = fileName?.trim() || "server-file";
  const lower = fallback.toLowerCase();
  const historySuffix = "-history.zip";
  if (lower.endsWith(historySuffix)) {
    return (
      fallback.slice(0, fallback.length - historySuffix.length) || fallback
    );
  }
  if (lower.endsWith(".zip")) {
    const innerExts = [
      "pdf",
      "doc",
      "docx",
      "ppt",
      "pptx",
      "xls",
      "xlsx",
      "png",
      "jpg",
      "jpeg",
      "tif",
      "tiff",
      "txt",
      "csv",
      "rtf",
      "html",
      "epub",
    ];
    for (const ext of innerExts) {
      if (lower.endsWith(`.${ext}.zip`)) {
        return fallback.slice(0, fallback.length - 4) || fallback;
      }
    }
  }
  return fallback;
}

/** Pull the server file list (and share-links) and reconcile with local stubs. */
export async function reconcileServerFiles(
  localStubs: StirlingFileStub[],
  opts: ReconcileOptions,
): Promise<StirlingFileStub[]> {
  if (!opts.storageEnabled) {
    return localStubs;
  }

  let combinedStubs = localStubs;
  const localRemoteIds = new Set(
    localStubs
      .map((s) => s.remoteStorageId)
      .filter((id): id is number => typeof id === "number"),
  );

  try {
    const response = await apiClient.get<StoredFileResponse[]>(
      "/api/v1/storage/files",
      {
        suppressErrorToast: true,
        skipAuthRedirect: true,
      } as any,
    );
    const serverFiles = Array.isArray(response.data) ? response.data : [];
    const serverMap = new Map<number, StoredFileResponse>();
    for (const file of serverFiles) {
      if (file && typeof file.id === "number") {
        serverMap.set(file.id, file);
      }
    }

    const updatedLocalStubs = localStubs.map((stub) => {
      if (!stub.remoteStorageId) {
        return stub;
      }
      const serverFile = serverMap.get(stub.remoteStorageId);
      if (!serverFile) {
        // Server no longer knows this file; if it was a shared-link link,
        // demote rather than detach. Otherwise drop remote metadata so the
        // file becomes local-only.
        if (stub.remoteSharedViaLink) {
          return { ...stub, remoteOwnedByCurrentUser: false };
        }
        return {
          ...stub,
          remoteStorageId: undefined,
          remoteStorageUpdatedAt: undefined,
          remoteOwnerUsername: undefined,
          remoteOwnedByCurrentUser: undefined,
          remoteAccessRole: undefined,
          remoteSharedViaLink: false,
          remoteHasShareLinks: undefined,
        };
      }
      if (serverFile.filePurpose && serverFile.filePurpose !== "generic") {
        // Signing-workflow files aren't user-facing in the file manager.
        return {
          ...stub,
          remoteStorageId: undefined,
          remoteStorageUpdatedAt: undefined,
          remoteOwnerUsername: undefined,
          remoteOwnedByCurrentUser: undefined,
          remoteAccessRole: undefined,
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
          typeof serverFile.ownedByCurrentUser === "boolean"
            ? serverFile.ownedByCurrentUser
            : stub.remoteOwnedByCurrentUser,
        remoteAccessRole: serverFile.accessRole ?? stub.remoteAccessRole,
        remoteSharedViaLink: stub.remoteSharedViaLink,
        remoteHasShareLinks: Boolean(serverFile.shareLinks?.length),
        remoteStorageUpdatedAt:
          typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs)
            ? updatedAtMs
            : stub.remoteStorageUpdatedAt,
        folderId: (serverFile.folderId as any) ?? stub.folderId,
      };
    });

    // Server files that this browser hasn't cached yet become ephemeral
    // stubs (id="server-{N}", no IDB row). Bytes get fetched on demand.
    const serverStubs: StirlingFileStub[] = [];
    for (const file of serverFiles) {
      if (!file || typeof file.id !== "number") continue;
      if (localRemoteIds.has(file.id)) continue;
      if (file.filePurpose && file.filePurpose !== "generic") continue;
      const updatedAtMs = file.updatedAt
        ? new Date(file.updatedAt).getTime()
        : file.createdAt
          ? new Date(file.createdAt).getTime()
          : Date.now();
      const name = normalizeServerFileName(file.fileName);
      const lastModified = Number.isFinite(updatedAtMs)
        ? updatedAtMs
        : Date.now();
      const id = `server-${file.id}` as FileId;
      serverStubs.push({
        id,
        name,
        type: file.contentType || "application/octet-stream",
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
          typeof file.ownedByCurrentUser === "boolean"
            ? file.ownedByCurrentUser
            : undefined,
        remoteAccessRole: file.accessRole ?? undefined,
        remoteSharedViaLink: false,
        remoteHasShareLinks: Boolean(file.shareLinks?.length),
        folderId: (file.folderId as any) ?? null,
      });
    }

    combinedStubs = [...updatedLocalStubs, ...serverStubs];
  } catch (err) {
    console.warn("[fileSyncService] failed to pull server files", err);
    return localStubs;
  }

  if (!opts.shareLinksEnabled) {
    return combinedStubs;
  }

  try {
    const response = await apiClient.get<AccessedShareLinkResponse[]>(
      "/api/v1/storage/share-links/accessed",
      { suppressErrorToast: true, skipAuthRedirect: true } as any,
    );
    const allowed = new Set(
      (Array.isArray(response.data) ? response.data : [])
        .map((l) => l.shareToken)
        .filter((t): t is string => Boolean(t)),
    );
    const writes: Array<Promise<boolean>> = [];
    combinedStubs = combinedStubs.map((stub) => {
      if (
        stub.remoteSharedViaLink &&
        stub.remoteShareToken &&
        !allowed.has(stub.remoteShareToken)
      ) {
        writes.push(
          fileStorage.updateFileMetadata(stub.id, {
            remoteStorageId: undefined,
            remoteStorageUpdatedAt: undefined,
            remoteOwnerUsername: undefined,
            remoteOwnedByCurrentUser: undefined,
            remoteSharedViaLink: false,
            remoteHasShareLinks: undefined,
            remoteShareToken: undefined,
          }),
        );
        return {
          ...stub,
          remoteStorageId: undefined,
          remoteStorageUpdatedAt: undefined,
          remoteOwnerUsername: undefined,
          remoteOwnedByCurrentUser: undefined,
          remoteSharedViaLink: false,
          remoteHasShareLinks: undefined,
          remoteShareToken: undefined,
        };
      }
      return stub;
    });
    if (writes.length > 0) {
      // Fire-and-forget; the in-memory list is the user-visible source.
      void Promise.all(writes).catch(() => {});
    }
  } catch (err) {
    console.warn("[fileSyncService] failed to pull share-links", err);
  }

  return combinedStubs;
}
