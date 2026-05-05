/**
 * Server-backed implementation of WatchFolderStorageBackend.
 *
 * Writes go to the server API first (source of truth), then mirror to IDB for fast reads.
 * Reads come from IDB (populated on init and after writes).
 * Falls back to IDB-only on network errors (NOT on auth/permission errors).
 */

import type { WatchFolderStorageBackend } from "@app/contexts/WatchFolderStorageContext";
import { smartFolderStorage, SMART_FOLDER_STORAGE_CHANGE_EVENT } from "@app/services/smartFolderStorage";
import { folderStorage } from "@app/services/folderStorage";
import { folderRunStateStorage } from "@app/services/folderRunStateStorage";
import type { SmartFolder, FolderRecord, FolderFileMetadata, SmartFolderRunEntry } from "@app/types/smartFolders";
import { watchFolderApi, WatchFolderDTO } from "./watchFolderApiService";
import { AxiosError } from "axios";

// ── Error classification ──────────────────────────────────────────────────

/** Returns true only for network/timeout errors where fallback to IDB makes sense. */
function isNetworkError(err: unknown): boolean {
  if (err instanceof AxiosError) {
    // No response at all = network failure / timeout
    if (!err.response) return true;
    // 5xx = server error, safe to fall back
    if (err.response.status >= 500) return true;
    // 401/403 = auth issue — don't silently fall back to stale IDB data
    return false;
  }
  return true; // Unknown error type — treat as network
}

/** True if the error is a 404 — treat as "not found" rather than a fatal error. */
function isNotFound(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 404;
}

// ── DTO ↔ Domain conversions ──────────────────────────────────────────────

function toSmartFolder(dto: WatchFolderDTO): SmartFolder {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description ?? "",
    automationId: "", // server uses inlined automationConfig instead
    automationConfig: dto.automationConfig,
    icon: dto.icon ?? "FolderIcon",
    accentColor: dto.accentColor ?? "#3b82f6",
    createdAt: dto.createdAt ?? new Date().toISOString(),
    updatedAt: dto.updatedAt ?? new Date().toISOString(),
    order: dto.orderIndex,
    isDefault: dto.isDefault,
    isPaused: dto.isPaused,
    scope: dto.scope,
    inputSource: (dto.inputSource as SmartFolder["inputSource"]) ?? "idb",
    processingMode: (dto.processingMode as SmartFolder["processingMode"]) ?? "local",
    outputMode: (dto.outputMode as SmartFolder["outputMode"]) ?? "new_file",
    outputName: dto.outputName,
    outputNamePosition: (dto.outputNamePosition as SmartFolder["outputNamePosition"]) ?? "prefix",
    outputTtlHours: dto.outputTtlHours,
    deleteOutputOnDownload: dto.deleteOutputOnDownload,
    maxRetries: dto.maxRetries,
    retryDelayMinutes: dto.retryDelayMinutes,
  };
}

function toDTO(folder: SmartFolder): WatchFolderDTO {
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description,
    automationConfig: folder.automationConfig,
    icon: folder.icon,
    accentColor: folder.accentColor,
    scope: folder.scope ?? "PERSONAL",
    orderIndex: folder.order,
    isDefault: folder.isDefault,
    isPaused: folder.isPaused,
    inputSource: folder.inputSource,
    processingMode: folder.processingMode,
    outputMode: folder.outputMode,
    outputName: folder.outputName,
    outputNamePosition: folder.outputNamePosition,
    outputTtlHours: folder.outputTtlHours,
    deleteOutputOnDownload: folder.deleteOutputOnDownload,
    maxRetries: folder.maxRetries,
    retryDelayMinutes: folder.retryDelayMinutes,
  };
}

function dispatchChange() {
  window.dispatchEvent(new Event(SMART_FOLDER_STORAGE_CHANGE_EVENT));
}

/**
 * Per-browser flags derived from local APIs (e.g. FileSystemDirectoryHandle in IDB).
 * The server doesn't store these; they must be carried over from the local "client-intended"
 * folder so a server roundtrip doesn't wipe them.
 */
function mergeLocalFlags(serverFolder: SmartFolder, clientIntended: SmartFolder): SmartFolder {
  return { ...serverFolder, hasOutputDirectory: clientIntended.hasOutputDirectory };
}

// ── Sync helper: pull server state into IDB ───────────────────────────────

let lastSyncAt = 0;
const SYNC_DEBOUNCE_MS = 10_000; // Don't re-sync more than once per 10s

async function syncFoldersToIdb(force = false): Promise<SmartFolder[]> {
  const now = Date.now();
  if (!force && now - lastSyncAt < SYNC_DEBOUNCE_MS) {
    // Return IDB cache — it's fresh enough
    return smartFolderStorage.getAllFolders();
  }

  const dtos = await watchFolderApi.list();
  const fromServer = dtos.map(toSmartFolder);
  lastSyncAt = Date.now();

  // Per-browser flags that depend on local APIs (FileSystemDirectoryHandle in IDB) are
  // NOT roundtripped through the server. Read them off the existing IDB rows and merge
  // back onto the server payload so a sync doesn't wipe them.
  const existing = await smartFolderStorage.getAllFolders();
  const existingById = new Map(existing.map((f) => [f.id, f]));
  const folders = fromServer.map((f) => {
    const prior = existingById.get(f.id);
    return prior ? { ...f, hasOutputDirectory: prior.hasOutputDirectory } : f;
  });

  const serverIds = new Set(folders.map((f) => f.id));
  // Remove folders from IDB that no longer exist on server
  for (const f of existing) {
    if (!serverIds.has(f.id)) {
      await smartFolderStorage.deleteFolder(f.id).catch(() => {});
    }
  }
  // Upsert server folders into IDB
  for (const f of folders) {
    await smartFolderStorage.createFolderWithId(f).catch(() => {});
  }
  dispatchChange();
  return folders;
}

// ── Backend implementation ────────────────────────────────────────────────

export const serverBackend: WatchFolderStorageBackend = {
  async getAllFolders() {
    try {
      return await syncFoldersToIdb();
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      return smartFolderStorage.getAllFolders();
    }
  },

  async getFolder(id) {
    try {
      const dto = await watchFolderApi.get(id);
      const fromServer = toSmartFolder(dto);
      // Preserve per-browser flags from any existing IDB row (server doesn't store them).
      const prior = await smartFolderStorage.getFolder(id);
      const folder = prior ? mergeLocalFlags(fromServer, prior) : fromServer;
      await smartFolderStorage.createFolderWithId(folder).catch(() => {});
      return folder;
    } catch (err) {
      // 404 → folder genuinely doesn't exist on server (or was deleted in another tab).
      // Don't fall back to IDB; return null so callers can treat as gone.
      if (isNotFound(err)) return null;
      if (!isNetworkError(err)) throw err;
      return smartFolderStorage.getFolder(id);
    }
  },

  async createFolder(data) {
    const timestamp = new Date().toISOString();
    const folder: SmartFolder = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    try {
      const created = await watchFolderApi.create(toDTO(folder));
      const result = mergeLocalFlags(toSmartFolder(created), folder);
      await smartFolderStorage.createFolderWithId(result).catch(() => {});
      lastSyncAt = 0; // Invalidate sync cache
      dispatchChange();
      return result;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      return smartFolderStorage.createFolder(data);
    }
  },

  async createFolderWithId(folder) {
    try {
      const created = await watchFolderApi.create(toDTO(folder));
      const result = mergeLocalFlags(toSmartFolder(created), folder);
      await smartFolderStorage.createFolderWithId(result).catch(() => {});
      lastSyncAt = 0;
      dispatchChange();
      return result;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      return smartFolderStorage.createFolderWithId(folder);
    }
  },

  async updateFolder(folder) {
    try {
      const updated = await watchFolderApi.update(folder.id, toDTO(folder));
      const result = mergeLocalFlags(toSmartFolder(updated), folder);
      await smartFolderStorage.createFolderWithId(result).catch(() => {});
      lastSyncAt = 0;
      dispatchChange();
      return result;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      return smartFolderStorage.updateFolder(folder);
    }
  },

  async deleteFolder(id) {
    try {
      await watchFolderApi.remove(id);
      lastSyncAt = 0;
    } catch (err) {
      // 404 = already deleted — that's success for delete semantics.
      if (isNotFound(err)) {
        lastSyncAt = 0;
      } else if (!isNetworkError(err)) {
        throw err;
      }
    }
    await smartFolderStorage.deleteFolder(id);
  },

  // File metadata — server-backed with IDB cache
  async getFolderData(folderId) {
    try {
      const files = await watchFolderApi.listFiles(folderId);
      const record: FolderRecord = {
        folderId,
        files: {},
        lastUpdated: Date.now(),
      };
      for (const f of files) {
        record.files[f.fileId] = {
          addedAt: f.addedAt ? new Date(f.addedAt) : new Date(),
          status: f.status as FolderFileMetadata["status"],
          name: f.name,
          errorMessage: f.errorMessage,
          failedAttempts: f.failedAttempts,
          ownedByFolder: f.ownedByFolder,
          pendingOnServerFolder: f.pendingOnServer,
          displayFileIds: f.displayFileIds ? JSON.parse(f.displayFileIds) : undefined,
          serverOutputFilenames: f.serverOutputFilenames ? JSON.parse(f.serverOutputFilenames) : undefined,
          processedAt: f.processedAt ? new Date(f.processedAt) : undefined,
        };
      }
      // Mirror to IDB silently — this is a cache write reflecting a read, not a user action.
      // Dispatching FOLDER_CHANGE_EVENT here would cause subscribers (useFolderData, etc.)
      // to re-call getFolderData → server → mirror → … infinite loop.
      await folderStorage.setFolderData(folderId, record, { silent: true }).catch(() => {});
      return record;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      return folderStorage.getFolderData(folderId);
    }
  },

  async updateFileMetadata(folderId, fileId, meta) {
    // Update IDB immediately for fast UI
    await folderStorage.updateFileMetadata(folderId, fileId, meta);
    // Sync to server — only swallow network failures; surface auth/config errors.
    try {
      const existing = await folderStorage.getFolderData(folderId);
      const fileMeta = existing?.files[fileId];
      if (fileMeta) {
        await watchFolderApi.upsertFile(folderId, {
          fileId,
          status: fileMeta.status,
          name: fileMeta.name,
          errorMessage: fileMeta.errorMessage,
          failedAttempts: fileMeta.failedAttempts,
          ownedByFolder: fileMeta.ownedByFolder,
          pendingOnServer: fileMeta.pendingOnServerFolder,
          displayFileIds: fileMeta.displayFileIds ? JSON.stringify(fileMeta.displayFileIds) : undefined,
          serverOutputFilenames: fileMeta.serverOutputFilenames ? JSON.stringify(fileMeta.serverOutputFilenames) : undefined,
          addedAt: fileMeta.addedAt?.toISOString(),
          processedAt: fileMeta.processedAt?.toISOString(),
        });
      }
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  },

  async addFileToFolder(folderId, fileId, meta) {
    await folderStorage.addFileToFolder(folderId, fileId, meta);
    try {
      await watchFolderApi.upsertFile(folderId, {
        fileId,
        status: meta?.status ?? "pending",
        name: meta?.name,
        ownedByFolder: meta?.ownedByFolder,
        addedAt: meta?.addedAt?.toISOString() ?? new Date().toISOString(),
      });
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  },

  async removeFileFromFolder(folderId, fileId) {
    // Server first: if the server delete fails the IDB row stays intact and the user can
    // retry. The opposite order (IDB-first) would make the file appear deleted in the UI,
    // then resurrect on the next getFolderData call when the server replies with the row
    // still present — confusing and harder to recover from.
    try {
      await watchFolderApi.deleteFile(folderId, fileId);
    } catch (err) {
      if (!isNotFound(err)) throw err;
      // 404: already gone server-side — fall through to IDB cleanup.
    }
    await folderStorage.removeFileFromFolder(folderId, fileId);
  },

  async clearFolder(folderId) {
    try {
      await watchFolderApi.deleteFiles(folderId);
    } catch (err) {
      if (isNotFound(err)) {
        // Already cleared on server — proceed.
      } else if (!isNetworkError(err)) {
        throw err;
      }
    }
    await folderStorage.clearFolder(folderId);
  },

  // Run state
  async getFolderRunState(folderId) {
    try {
      const runs = await watchFolderApi.listRuns(folderId);
      const entries: SmartFolderRunEntry[] = runs.map((r) => ({
        inputFileId: r.inputFileId,
        displayFileId: r.displayFileId ?? "",
        displayFileIds: r.displayFileIds ? JSON.parse(r.displayFileIds) : undefined,
        status: r.status as SmartFolderRunEntry["status"],
        processedAt: r.processedAt ? new Date(r.processedAt) : undefined,
      }));
      return entries;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      return folderRunStateStorage.getFolderRunState(folderId);
    }
  },

  async addFolderRunEntries(folderId, entries) {
    // IDB first
    await folderRunStateStorage.appendRunEntries(folderId, entries);
    // Server sync
    try {
      await watchFolderApi.addRuns(
        folderId,
        entries.map((e) => ({
          inputFileId: e.inputFileId,
          displayFileId: e.displayFileId,
          displayFileIds: e.displayFileIds ? JSON.stringify(e.displayFileIds) : undefined,
          status: e.status,
          processedAt: e.processedAt?.toISOString(),
        })),
      );
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  },

  async clearFolderRunState(folderId) {
    // Server first — see removeFileFromFolder above for the reasoning.
    try {
      await watchFolderApi.deleteRuns(folderId);
    } catch (err) {
      if (!isNotFound(err)) {
        // Network failure or auth/4xx — surface so caller can retry.
        throw err;
      }
      // 404: folder gone or no runs — fall through to IDB cleanup.
    }
    await folderRunStateStorage.clearFolderRunState(folderId);
  },

  onChange(callback) {
    window.addEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, callback);
    return () => window.removeEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, callback);
  },
};
