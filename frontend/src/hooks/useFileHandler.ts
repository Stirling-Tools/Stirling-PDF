import { useCallback } from 'react';
import { useFileActions } from '../contexts/FileContext';

export const useFileHandler = () => {
  const { actions } = useFileActions();

  const addFiles = useCallback(async (files: File[], options: { insertAfterPageId?: string; selectFiles?: boolean } = {}) => {
    // Merge default options with passed options - passed options take precedence
    const mergedOptions = { selectFiles: true, ...options };
    // Let FileContext handle deduplication with quickKey logic
    await actions.addFiles(files, mergedOptions);
  }, [actions.addFiles]);

  return {
    addFiles,
  };
};
