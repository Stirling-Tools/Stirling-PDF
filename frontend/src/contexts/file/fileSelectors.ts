/**
 * File selectors - Pure functions for accessing file state
 */

import { 
  FileId, 
  FileRecord, 
  FileContextState,
  FileContextSelectors 
} from '../../types/fileContext';

/**
 * Create stable selectors using stateRef and filesRef
 */
export function createFileSelectors(
  stateRef: React.MutableRefObject<FileContextState>,
  filesRef: React.MutableRefObject<Map<FileId, File>>
): FileContextSelectors {
  return {
    getFile: (id: FileId) => filesRef.current.get(id),
    
    getFiles: (ids?: FileId[]) => {
      const currentIds = ids || stateRef.current.files.ids;
      return currentIds.map(id => filesRef.current.get(id)).filter(Boolean) as File[];
    },
    
    getFileRecord: (id: FileId) => stateRef.current.files.byId[id],
    
    getFileRecords: (ids?: FileId[]) => {
      const currentIds = ids || stateRef.current.files.ids;
      return currentIds.map(id => stateRef.current.files.byId[id]).filter(Boolean);
    },
    
    getAllFileIds: () => stateRef.current.files.ids,
    
    getSelectedFiles: () => {
      return stateRef.current.ui.selectedFileIds
        .map(id => filesRef.current.get(id))
        .filter(Boolean) as File[];
    },
    
    getSelectedFileRecords: () => {
      return stateRef.current.ui.selectedFileIds
        .map(id => stateRef.current.files.byId[id])
        .filter(Boolean);
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
export function buildQuickKeySet(fileRecords: Record<FileId, FileRecord>): Set<string> {
  const quickKeys = new Set<string>();
  Object.values(fileRecords).forEach(record => {
    quickKeys.add(record.quickKey);
  });
  return quickKeys;
}

/**
 * Get primary file (first in list) - commonly used pattern
 */
export function getPrimaryFile(
  stateRef: React.MutableRefObject<FileContextState>,
  filesRef: React.MutableRefObject<Map<FileId, File>>
): { file?: File; record?: FileRecord } {
  const primaryFileId = stateRef.current.files.ids[0];
  if (!primaryFileId) return {};
  
  return {
    file: filesRef.current.get(primaryFileId),
    record: stateRef.current.files.byId[primaryFileId]
  };
}