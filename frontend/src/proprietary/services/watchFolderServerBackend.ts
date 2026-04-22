/**
 * Server-backed implementation of WatchFolderStorageBackend.
 *
 * Writes go to the server API first (source of truth), then mirror to IDB for fast reads.
 * Reads come from IDB (populated on init and after writes).
 * Falls back to IDB-only if the server is unreachable.
 */

import type { WatchFolderStorageBackend } from '@app/contexts/WatchFolderStorageContext';
import { smartFolderStorage, SMART_FOLDER_STORAGE_CHANGE_EVENT } from '@app/services/smartFolderStorage';
import { folderStorage } from '@app/services/folderStorage';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';
import type { SmartFolder, FolderRecord, FolderFileMetadata, SmartFolderRunEntry } from '@app/types/smartFolders';
import { watchFolderApi, WatchFolderDTO, WatchFolderFileDTO, WatchFolderRunDTO } from './watchFolderApiService';

// ── DTO ↔ Domain conversions ───────────────────────────────────────────────

function toSmartFolder(dto: WatchFolderDTO): SmartFolder {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description ?? '',
    automationId: '', // automation config is inlined — hooks resolve this
    icon: dto.icon ?? 'FolderIcon',
    accentColor: dto.accentColor ?? '#3b82f6',
    createdAt: dto.createdAt ?? new Date().toISOString(),
    updatedAt: dto.updatedAt ?? new Date().toISOString(),
    order: dto.orderIndex,
    isDefault: dto.isDefault,
    isPaused: dto.isPaused,
    inputSource: (dto.inputSource as SmartFolder['inputSource']) ?? 'idb',
    processingMode: (dto.processingMode as SmartFolder['processingMode']) ?? 'local',
    outputMode: (dto.outputMode as SmartFolder['outputMode']) ?? 'new_file',
    outputName: dto.outputName,
    outputNamePosition: (dto.outputNamePosition as SmartFolder['outputNamePosition']) ?? 'prefix',
    outputTtlHours: dto.outputTtlHours,
    deleteOutputOnDownload: dto.deleteOutputOnDownload,
    maxRetries: dto.maxRetries,
    retryDelayMinutes: dto.retryDelayMinutes,
  };
}

function toDTO(folder: SmartFolder & { scope?: string }): WatchFolderDTO {
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description,
    icon: folder.icon,
    accentColor: folder.accentColor,
    scope: (folder as any).scope ?? 'PERSONAL',
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

// ── Sync helper: pull server state into IDB ────────────────────────────────

async function syncFoldersToIdb(): Promise<SmartFolder[]> {
  const dtos = await watchFolderApi.list();
  const folders = dtos.map(toSmartFolder);
  // Overwrite IDB with server state
  const existing = await smartFolderStorage.getAllFolders();
  const serverIds = new Set(folders.map(f => f.id));
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

// ── Backend implementation ─────────────────────────────────────────────────

export const serverBackend: WatchFolderStorageBackend = {
  async getAllFolders() {
    try {
      return await syncFoldersToIdb();
    } catch {
      // Server unreachable — fall back to IDB
      return smartFolderStorage.getAllFolders();
    }
  },

  async getFolder(id) {
    try {
      const dto = await watchFolderApi.get(id);
      const folder = toSmartFolder(dto);
      await smartFolderStorage.createFolderWithId(folder).catch(() => {});
      return folder;
    } catch {
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
      const result = toSmartFolder(created);
      await smartFolderStorage.createFolderWithId(result).catch(() => {});
      dispatchChange();
      return result;
    } catch {
      // Offline — create in IDB only
      return smartFolderStorage.createFolder(data);
    }
  },

  async createFolderWithId(folder) {
    try {
      const created = await watchFolderApi.create(toDTO(folder));
      const result = toSmartFolder(created);
      await smartFolderStorage.createFolderWithId(result).catch(() => {});
      dispatchChange();
      return result;
    } catch {
      return smartFolderStorage.createFolderWithId(folder);
    }
  },

  async updateFolder(folder) {
    try {
      const updated = await watchFolderApi.update(folder.id, toDTO(folder));
      const result = toSmartFolder(updated);
      await smartFolderStorage.createFolderWithId(result).catch(() => {});
      dispatchChange();
      return result;
    } catch {
      return smartFolderStorage.updateFolder(folder);
    }
  },

  async deleteFolder(id) {
    try {
      await watchFolderApi.remove(id);
    } catch {
      // best-effort server delete
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
          status: f.status as FolderFileMetadata['status'],
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
      // Mirror to IDB
      await folderStorage.setFolderData(folderId, record).catch(() => {});
      return record;
    } catch {
      return folderStorage.getFolderData(folderId);
    }
  },

  async updateFileMetadata(folderId, fileId, meta) {
    // Update IDB immediately for fast UI
    await folderStorage.updateFileMetadata(folderId, fileId, meta);
    // Sync to server
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
    } catch {
      // Server sync failed — IDB is still up to date
    }
  },

  async addFileToFolder(folderId, fileId, meta) {
    await folderStorage.addFileToFolder(folderId, fileId, meta);
    try {
      await watchFolderApi.upsertFile(folderId, {
        fileId,
        status: meta?.status ?? 'pending',
        name: meta?.name,
        ownedByFolder: meta?.ownedByFolder,
        addedAt: meta?.addedAt?.toISOString() ?? new Date().toISOString(),
      });
    } catch {
      // offline — IDB has the data
    }
  },

  async clearFolder(folderId) {
    try {
      await watchFolderApi.deleteFiles(folderId);
    } catch { /* best-effort */ }
    await folderStorage.clearFolder(folderId);
  },

  // Run state
  async getFolderRunState(folderId) {
    try {
      const runs = await watchFolderApi.listRuns(folderId);
      const entries: SmartFolderRunEntry[] = runs.map(r => ({
        inputFileId: r.inputFileId,
        displayFileId: r.displayFileId ?? '',
        displayFileIds: r.displayFileIds ? JSON.parse(r.displayFileIds) : undefined,
        status: r.status as SmartFolderRunEntry['status'],
        processedAt: r.processedAt ? new Date(r.processedAt) : undefined,
      }));
      return entries;
    } catch {
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
        entries.map(e => ({
          inputFileId: e.inputFileId,
          displayFileId: e.displayFileId,
          displayFileIds: e.displayFileIds ? JSON.stringify(e.displayFileIds) : undefined,
          status: e.status,
          processedAt: e.processedAt?.toISOString(),
        }))
      );
    } catch { /* offline */ }
  },

  async clearFolderRunState(folderId) {
    try {
      // No dedicated endpoint yet — runs are deleted with the folder
    } catch { /* best-effort */ }
    await folderRunStateStorage.clearFolderRunState(folderId);
  },

  onChange(callback) {
    window.addEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, callback);
    return () => window.removeEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, callback);
  },
};
