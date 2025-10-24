/**
 * File selectors - Pure functions for accessing file state
 */

import { FileId } from '@app/types/file';
import {
  StirlingFileStub,
  FileContextState,
  FileContextSelectors,
  StirlingFile,
  createStirlingFile
} from '@app/types/fileContext';

/**
 * Create stable selectors using stateRef and filesRef
 */
export function createFileSelectors(
  stateRef: React.MutableRefObject<FileContextState>,
  filesRef: React.MutableRefObject<Map<FileId, File>>
): FileContextSelectors {
  return {
    getFile: (id: FileId) => {
      const file = filesRef.current.get(id);
      return file ? createStirlingFile(file, id) : undefined;
    },

    getFiles: (ids?: FileId[]) => {
      const currentIds = ids || stateRef.current.files.ids;
      return currentIds
        .map(id => {
          const file = filesRef.current.get(id);
          return file ? createStirlingFile(file, id) : undefined;
        })
        .filter(Boolean) as StirlingFile[];
    },

    getStirlingFileStub: (id: FileId) => stateRef.current.files.byId[id],

    getStirlingFileStubs: (ids?: FileId[]) => {
      const currentIds = ids || stateRef.current.files.ids;
      return currentIds.map(id => stateRef.current.files.byId[id]).filter(Boolean);
    },

    getAllFileIds: () => stateRef.current.files.ids,

    getSelectedFiles: () => {
      return stateRef.current.ui.selectedFileIds
        .map(id => {
          const file = filesRef.current.get(id);
          return file ? createStirlingFile(file, id) : undefined;
        })
        .filter(Boolean) as StirlingFile[];
    },

    getSelectedStirlingFileStubs: () => {
      return stateRef.current.ui.selectedFileIds
        .map(id => stateRef.current.files.byId[id])
        .filter(Boolean);
    },

    // Pinned files selectors
    getPinnedFileIds: () => {
      return Array.from(stateRef.current.pinnedFiles);
    },

    getPinnedFiles: () => {
      return Array.from(stateRef.current.pinnedFiles)
        .map(id => {
          const file = filesRef.current.get(id);
          return file ? createStirlingFile(file, id) : undefined;
        })
        .filter(Boolean) as StirlingFile[];
    },

    getPinnedStirlingFileStubs: () => {
      return Array.from(stateRef.current.pinnedFiles)
        .map(id => stateRef.current.files.byId[id])
        .filter(Boolean);
    },

    isFilePinned: (file: StirlingFile) => {
      return stateRef.current.pinnedFiles.has(file.fileId);
    },

    // Stable signature for effects - prevents unnecessary re-renders
    getFilesSignature: () => {
      return stateRef.current.files.ids
        .map(id => {
          const record = stateRef.current.files.byId[id];
          return record ? `${id}:${record.size}:${record.lastModified}` : '';
        })
        .join('|');
    },

  };
}

/**
 * Helper for building quickKey sets for deduplication
 */
export function buildQuickKeySet(stirlingFileStubs: Record<FileId, StirlingFileStub>): Set<string> {
  const quickKeys = new Set<string>();
  Object.values(stirlingFileStubs).forEach(record => {
    if (record.quickKey) {
      quickKeys.add(record.quickKey);
    }
  });
  return quickKeys;
}

/**
 * Helper for building quickKey sets from IndexedDB metadata
 */
export function buildQuickKeySetFromMetadata(metadata: Array<{ name: string; size: number; lastModified: number }>): Set<string> {
  const quickKeys = new Set<string>();
  metadata.forEach(meta => {
    // Format: name|size|lastModified (same as createQuickKey)
    const quickKey = `${meta.name}|${meta.size}|${meta.lastModified}`;
    quickKeys.add(quickKey);
  });
  return quickKeys;
}

/**
 * Get primary file (first in list) - commonly used pattern
 */
export function getPrimaryFile(
  stateRef: React.MutableRefObject<FileContextState>,
  filesRef: React.MutableRefObject<Map<FileId, File>>
): { file?: File; record?: StirlingFileStub } {
  const primaryFileId = stateRef.current.files.ids[0];
  if (!primaryFileId) return {};

  return {
    file: filesRef.current.get(primaryFileId),
    record: stateRef.current.files.byId[primaryFileId]
  };
}
