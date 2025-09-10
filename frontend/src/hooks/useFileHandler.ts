import { useCallback } from 'react';
import { useFileState, useFileActions } from '../contexts/FileContext';
import { StoredFileMetadata, StoredFile } from '../services/fileStorage';
import { FileId } from '../types/file';

export const useFileHandler = () => {
  const { state } = useFileState(); // Still needed for addStoredFiles
  const { actions } = useFileActions();

  const addToActiveFiles = useCallback(async (file: File) => {
    // Let FileContext handle deduplication with quickKey logic
    await actions.addFiles([file], { selectFiles: true });
  }, [actions.addFiles]);

  const addMultipleFiles = useCallback(async (files: File[]) => {
    // Let FileContext handle deduplication with quickKey logic
    await actions.addFiles(files, { selectFiles: true });
  }, [actions.addFiles]);

  // Add stored files preserving their original IDs to prevent session duplicates
  const addStoredFiles = useCallback(async (storedFiles: StoredFile[]) => {
    // Filter out files that already exist with the same ID (exact match)
    const newFiles = storedFiles.filter(({ id }) => {
      return state.files.byId[id] === undefined;
    });

    if (newFiles.length > 0) {
      await actions.addStoredFiles(newFiles, { selectFiles: true });
    }

    console.log(`📁 Added ${newFiles.length} stored files (${storedFiles.length - newFiles.length} skipped as duplicates)`);
  }, [state.files.byId, actions.addStoredFiles]);

  return {
    addToActiveFiles,
    addMultipleFiles,
    addStoredFiles,
  };
};
