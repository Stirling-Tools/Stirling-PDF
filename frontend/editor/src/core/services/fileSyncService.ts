/**
 * Reconciles the local IDB file stub list with the server's view of which
 * files the user can see. Server is source of truth for cloud files; local
 * IDB caches them so the grid renders instantly while the server call is in
 * flight and so local-only files survive offline.
 */

import apiClient from "@app/services/apiClient";
import { fileStorage } from "@app/services/fileStorage";
import { alert } from "@app/components/toast";
import { StirlingFileStub, StirlingFile } from "@app/types/fileContext";
import { FileId } from "@app/types/fileContext";
import { FolderId, parseFolderId } from "@app/types/folder";
import {
  isZipBundle,
  loadShareBundleEntries,
  parseContentDispositionFilename,
} from "@app/services/shareBundleUtils";

/**
 * Trust-boundary parser for folderId values coming back from the server.
 * Matches folderSyncService's discipline - we never want a garbage server
 * payload to corrupt the local IDB `folderId` index. Returns null on any
 * invalid input so the file falls back to the root folder.
 */
function safeParseFolderId(value: unknown): FolderId | null {
  if (value == null || value === "") return null;
  try {
    return parseFolderId(value);
  } catch {
    console.warn("[fileSyncService] dropping invalid server folderId", value);
    return null;
  }
}

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
  sharedUsers?: Array<{ username?: string | null }>;
  sharedWithUsers?: string[];
  filePurpose?: string | null;
  folderId?: string | null;
}

interface AccessedShareLinkResponse {
  shareToken?: string | null;
  fileId?: number | null;
  fileName?: string | null;
  owner?: string | null;
  ownedByCurrentUser?: boolean;
  createdAt?: string | null;
  lastAccessedAt?: string | null;
}

export interface ReconcileOptions {
  storageEnabled: boolean;
  shareLinksEnabled: boolean;
  /**
   * Guests (anonymous sessions) have no cloud library; pulling it just 401s and
   * surfaces a "sign in to load cloud files" toast. Skip the server pull for
   * them and fall back to locally-cached files only.
   */
  isAnonymous?: boolean;
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
  if (!opts.storageEnabled || opts.isAnonymous) {
    return localStubs;
  }

  let combinedStubs: StirlingFileStub[];
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
        remoteHasUserShares: Boolean(
          serverFile.sharedUsers?.length || serverFile.sharedWithUsers?.length,
        ),
        remoteStorageUpdatedAt:
          typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs)
            ? updatedAtMs
            : stub.remoteStorageUpdatedAt,
        // Server is authoritative for cloud-stored files. Don't fall back to
        // stub.folderId on null - that would resurrect a stale folder pointer
        // after the server SET_NULL'd it (e.g. owner deleted the folder).
        folderId: safeParseFolderId(serverFile.folderId),
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
        remoteHasUserShares: Boolean(
          file.sharedUsers?.length || file.sharedWithUsers?.length,
        ),
        folderId: safeParseFolderId(file.folderId),
      });
    }

    combinedStubs = [...updatedLocalStubs, ...serverStubs];
  } catch (err) {
    // Surface to the user so they don't silently see only locally-cached
    // files and assume their cloud data is lost. Toast deduplicates by title
    // so a repeated failure isn't an avalanche of identical popups.
    const status = (err as { response?: { status?: number } })?.response
      ?.status;
    console.warn("[fileSyncService] failed to pull server files", err);
    alert({
      alertType: "warning",
      title:
        status === 401
          ? "Sign-in required to load cloud files"
          : "Could not reach the cloud library",
      body: "Showing only files cached in this browser. Refresh to retry once the connection is back.",
      expandable: false,
      durationMs: 5000,
    });
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
    const sharedLinks = Array.isArray(response.data) ? response.data : [];
    const allowed = new Set(
      sharedLinks
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

    // Synthesize ephemeral shared-{token} stubs for share-links the user has
    // accessed but doesn't have cached locally yet. Materialize on demand.
    const existingShareTokens = new Set(
      combinedStubs
        .map((stub) => stub.remoteShareToken)
        .filter((token): token is string => Boolean(token)),
    );
    const sharedStubs: StirlingFileStub[] = [];
    for (const link of sharedLinks) {
      if (!link || !link.shareToken) continue;
      if (existingShareTokens.has(link.shareToken)) continue;
      const accessedMs = link.lastAccessedAt
        ? new Date(link.lastAccessedAt).getTime()
        : link.createdAt
          ? new Date(link.createdAt).getTime()
          : Date.now();
      const lastModified = Number.isFinite(accessedMs)
        ? accessedMs
        : Date.now();
      const name = normalizeServerFileName(link.fileName || "shared-file");
      const id = `shared-${link.shareToken}` as FileId;
      sharedStubs.push({
        id,
        name,
        type: "application/octet-stream",
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
  } catch (err) {
    console.warn("[fileSyncService] failed to pull share-links", err);
  }

  return combinedStubs;
}

/**
 * Download bytes for any server-only stubs (id starts with "server-") and
 * ingest them into IDB. Returns a stub list where the server-only entries
 * are replaced with proper local stubs that point to the freshly-cached
 * IDB rows. Local stubs are passed through untouched.
 *
 * Pass `addFiles` (from FileContext.addFilesWithOptions) and
 * `updateStub` (from FileContext.updateStirlingFileStub) so this util
 * stays React-free; the caller provides the wiring.
 */
export async function materializeServerStubs(
  stubs: StirlingFileStub[],
  helpers: {
    addFiles: (
      files: File[],
      options: {
        selectFiles: boolean;
        autoUnzip: boolean;
        skipAutoUnzip: boolean;
        allowDuplicates: boolean;
        skipUploadTracking?: boolean;
      },
    ) => Promise<StirlingFile[]>;
    updateStub: (id: FileId, updates: Partial<StirlingFileStub>) => void;
  },
): Promise<StirlingFileStub[]> {
  const out: StirlingFileStub[] = [];
  // Collect per-stub failures so we can surface ONE summarized toast at the
  // end instead of N popups (or worse, silently dropping files from the grid
  // with zero user signal as the previous code did).
  const failed: { name: string; status?: number }[] = [];
  for (const stub of stubs) {
    const isServerStub =
      typeof stub.id === "string" &&
      stub.id.startsWith("server-") &&
      typeof stub.remoteStorageId === "number";
    const isSharedStub =
      typeof stub.id === "string" &&
      stub.id.startsWith("shared-") &&
      typeof stub.remoteShareToken === "string";
    if (!isServerStub && !isSharedStub) {
      out.push(stub);
      continue;
    }
    try {
      const downloadUrl = isSharedStub
        ? `/api/v1/storage/share-links/${stub.remoteShareToken}`
        : `/api/v1/storage/files/${stub.remoteStorageId}/download`;
      const response = await apiClient.get(downloadUrl, {
        responseType: "blob",
        suppressErrorToast: true,
        skipAuthRedirect: true,
      } as any);
      const rawHeaders = (response.headers ?? {}) as Record<string, unknown> & {
        get?: (name: string) => string | null;
      };
      const readHeader = (name: string): string => {
        if (typeof rawHeaders.get === "function") {
          return rawHeaders.get(name) ?? "";
        }
        const lower = rawHeaders[name];
        const upper =
          rawHeaders[
            name.replace(/(^|-)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase())
          ];
        return (
          (typeof lower === "string" && lower) ||
          (typeof upper === "string" && upper) ||
          ""
        );
      };
      const contentType = readHeader("content-type");
      const disposition = readHeader("content-disposition");
      const filename =
        parseContentDispositionFilename(disposition) || stub.name;
      const blob = response.data as Blob;

      // Server bundle: extract latest file(s) inside.
      const bundle = isZipBundle(contentType, filename)
        ? await loadShareBundleEntries(blob).catch(() => null)
        : null;
      const files: File[] = bundle
        ? bundle.files
        : [new File([blob], filename, { type: contentType || blob.type })];

      const ingested = await helpers.addFiles(files, {
        selectFiles: false,
        autoUnzip: false,
        skipAutoUnzip: true,
        allowDuplicates: true,
        skipUploadTracking: true,
      });
      if (ingested.length === 0) continue;
      const primary = ingested[ingested.length - 1]!;
      const newId = primary.fileId as FileId;
      const remoteUpdates = {
        remoteStorageId: stub.remoteStorageId,
        remoteStorageUpdatedAt: stub.remoteStorageUpdatedAt,
        remoteOwnerUsername: stub.remoteOwnerUsername,
        remoteOwnedByCurrentUser: stub.remoteOwnedByCurrentUser,
        remoteAccessRole: stub.remoteAccessRole,
        remoteSharedViaLink: isSharedStub ? true : false,
        remoteHasShareLinks: stub.remoteHasShareLinks,
        remoteShareToken: isSharedStub ? stub.remoteShareToken : undefined,
      };
      helpers.updateStub(newId, remoteUpdates);
      await fileStorage.updateFileMetadata(newId, remoteUpdates);
      out.push({ ...stub, ...remoteUpdates, id: newId, originalFileId: newId });
    } catch (err) {
      console.warn("[fileSyncService] failed to materialize server stub", err);
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      failed.push({ name: stub.name, status });
    }
  }
  if (failed.length > 0) {
    // Single summarized toast - far less noisy than per-stub alerts but
    // still surfaces what would otherwise be a silent drop from the grid.
    const first = failed[0]!;
    const bodyText =
      failed.length === 1
        ? `Couldn't open "${first.name}"${first.status ? ` (HTTP ${first.status})` : ""}.`
        : `Couldn't open ${failed.length} files including "${first.name}".`;
    alert({
      alertType: "warning",
      title: "Some files couldn't be opened",
      body: bodyText,
      expandable: false,
      durationMs: 5000,
    });
  }
  return out;
}
