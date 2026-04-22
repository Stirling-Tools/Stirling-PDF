/**
 * IDB-only implementation of WatchFolderStorageBackend.
 *
 * Wraps the existing IDB singletons into the storage interface
 * so core hooks can use them through the context.
 */

import type { WatchFolderStorageBackend } from '@app/contexts/WatchFolderStorageContext';
import { smartFolderStorage, SMART_FOLDER_STORAGE_CHANGE_EVENT } from '@app/services/smartFolderStorage';
import { folderStorage } from '@app/services/folderStorage';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';
import type { SmartFolder, FolderRecord, FolderFileMetadata, SmartFolderRunEntry } from '@app/types/smartFolders';

export const idbBackend: WatchFolderStorageBackend = {
  // Folder CRUD
  getAllFolders: () => smartFolderStorage.getAllFolders(),
  getFolder: (id) => smartFolderStorage.getFolder(id),
  createFolder: (data) => smartFolderStorage.createFolder(data),
  createFolderWithId: (folder) => smartFolderStorage.createFolderWithId(folder),
  updateFolder: (folder) => smartFolderStorage.updateFolder(folder),
  deleteFolder: (id) => smartFolderStorage.deleteFolder(id),

  // File metadata
  getFolderData: (folderId) => folderStorage.getFolderData(folderId),
  updateFileMetadata: (folderId, fileId, meta) => folderStorage.updateFileMetadata(folderId, fileId, meta),
  addFileToFolder: (folderId, fileId, meta) => folderStorage.addFileToFolder(folderId, fileId, meta),
  clearFolder: (folderId) => folderStorage.clearFolder(folderId),

  // Run state
  getFolderRunState: (folderId) => folderRunStateStorage.getFolderRunState(folderId),
  addFolderRunEntries: (folderId, entries) => folderRunStateStorage.appendRunEntries(folderId, entries),
  clearFolderRunState: (folderId) => folderRunStateStorage.clearFolderRunState(folderId),

  // Events
  onChange(callback) {
    window.addEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, callback);
    return () => window.removeEventListener(SMART_FOLDER_STORAGE_CHANGE_EVENT, callback);
  },
};
