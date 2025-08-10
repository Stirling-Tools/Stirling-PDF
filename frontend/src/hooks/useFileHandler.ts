import { useCallback } from 'react';
import { useFileContext } from '../contexts/FileContext';

export const useFileHandler = () => {
  const { activeFiles, addFiles } = useFileContext();

  const addToActiveFiles = useCallback(async (file: File) => {
    const exists = activeFiles.some(f => f.name === file.name && f.size === file.size);
    if (!exists) {
      await addFiles([file]);
    }
  }, [activeFiles, addFiles]);

  const addMultipleFiles = useCallback(async (files: File[]) => {
    const newFiles = files.filter(file => 
      !activeFiles.some(f => f.name === file.name && f.size === file.size)
    );
    if (newFiles.length > 0) {
      await addFiles(newFiles);
    }
  }, [activeFiles, addFiles]);

  return {
    addToActiveFiles,
    addMultipleFiles,
  };
};