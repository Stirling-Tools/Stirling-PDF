import { useCallback } from 'react';
import { useFileActions } from '../contexts/FileContext';

export const useFileHandler = () => {
  const { actions } = useFileActions();

  const addFiles = useCallback(async (files: File[]) => {
    // Let FileContext handle deduplication with quickKey logic
    await actions.addFiles(files, { selectFiles: true });
  }, [actions.addFiles]);

  return {
    addFiles,
  };
};
