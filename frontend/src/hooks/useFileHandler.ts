import { useCallback } from 'react';
import { useFileState, useFileActions } from '../contexts/FileContext';
import { FileMetadata } from '../types/file';
import { FileId } from '../types/file';

export const useFileHandler = () => {
  const { state } = useFileState();
  const { actions } = useFileActions();

  const addToActiveFiles = useCallback(async (file: File) => {
    await actions.addFiles([file], { selectFiles: true });
  }, [actions.addFiles]);

  const addMultipleFiles = useCallback(async (files: File[]) => {
    await actions.addFiles(files, { selectFiles: true });
  }, [actions.addFiles]);

  // Add stored files preserving their original IDs to prevent session duplicates
  const addStoredFiles = useCallback(async (filesWithMetadata: Array<{ file: File; originalId: FileId; metadata: FileMetadata }>) => {
    // Filter out files that already exist with the same ID (exact match)
    const newFiles = filesWithMetadata.filter(({ originalId }) => {
      return state.files.byId[originalId] === undefined;
    });

    if (newFiles.length > 0) {
      await actions.addStoredFiles(newFiles, { selectFiles: true });
    }

    console.log(`📁 Added ${newFiles.length} stored files (${filesWithMetadata.length - newFiles.length} skipped as duplicates)`);
  }, [state.files.byId, actions.addStoredFiles]);

  return {
    addToActiveFiles,
    addMultipleFiles,
    addStoredFiles,
  };
};
