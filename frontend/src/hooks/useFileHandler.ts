import { useCallback } from 'react';
import { useFileState, useFileActions } from '../contexts/FileContext';
import { createStableFileId } from '../types/fileContext';

export const useFileHandler = () => {
  const { state } = useFileState();
  const { actions } = useFileActions();

  const addToActiveFiles = useCallback(async (file: File) => {
    // Use stable ID function for consistent deduplication
    const stableId = createStableFileId(file);
    const exists = state.files.byId[stableId] !== undefined;
    
    if (!exists) {
      await actions.addFiles([file]);
    }
  }, [state.files.byId, actions.addFiles]);

  const addMultipleFiles = useCallback(async (files: File[]) => {
    // Filter out files that already exist using stable IDs
    const newFiles = files.filter(file => {
      const stableId = createStableFileId(file);
      return state.files.byId[stableId] === undefined;
    });
    
    if (newFiles.length > 0) {
      await actions.addFiles(newFiles);
    }
  }, [state.files.byId, actions.addFiles]);

  return {
    addToActiveFiles,
    addMultipleFiles,
  };
};