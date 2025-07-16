import { useState, useCallback } from 'react';
import { fileStorage } from '../services/fileStorage';
import { FileWithUrl } from '../types/file';

export const useFileManager = () => {
  const [loading, setLoading] = useState(false);

  const convertToFile = useCallback(async (fileWithUrl: FileWithUrl): Promise<File> => {
    if (fileWithUrl.url && fileWithUrl.url.startsWith('blob:')) {
      const response = await fetch(fileWithUrl.url);
      const data = await response.arrayBuffer();
      const file = new File([data], fileWithUrl.name, {
        type: fileWithUrl.type || 'application/pdf',
        lastModified: fileWithUrl.lastModified || Date.now()
      });
      // Preserve the ID if it exists
      if (fileWithUrl.id) {
        Object.defineProperty(file, 'id', { value: fileWithUrl.id, writable: false });
      }
      return file;
    }

    // Always use ID first, fallback to name only if ID doesn't exist
    const lookupKey = fileWithUrl.id || fileWithUrl.name;
    const storedFile = await fileStorage.getFile(lookupKey);
    if (storedFile) {
      const file = new File([storedFile.data], storedFile.name, {
        type: storedFile.type,
        lastModified: storedFile.lastModified
      });
      // Add the ID to the file object
      Object.defineProperty(file, 'id', { value: storedFile.id, writable: false });
      return file;
    }

    throw new Error('File not found in storage');
  }, []);

  const loadRecentFiles = useCallback(async (): Promise<FileWithUrl[]> => {
    setLoading(true);
    try {
      const files = await fileStorage.getAllFiles();
      const sortedFiles = files.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
      return sortedFiles;
    } catch (error) {
      console.error('Failed to load recent files:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRemoveFile = useCallback(async (index: number, files: FileWithUrl[], setFiles: (files: FileWithUrl[]) => void) => {
    const file = files[index];
    try {
      await fileStorage.deleteFile(file.id || file.name);
      setFiles(files.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Failed to remove file:', error);
      throw error;
    }
  }, []);

  const storeFile = useCallback(async (file: File) => {
    try {
      const storedFile = await fileStorage.storeFile(file);
      // Add the ID to the file object
      Object.defineProperty(file, 'id', { value: storedFile.id, writable: false });
      return storedFile;
    } catch (error) {
      console.error('Failed to store file:', error);
      throw error;
    }
  }, []);

  const createFileSelectionHandlers = useCallback((
    selectedFiles: string[],
    setSelectedFiles: (files: string[]) => void
  ) => {
    const toggleSelection = (fileId: string) => {
      setSelectedFiles(
        selectedFiles.includes(fileId)
          ? selectedFiles.filter(id => id !== fileId)
          : [...selectedFiles, fileId]
      );
    };

    const clearSelection = () => {
      setSelectedFiles([]);
    };

    const selectMultipleFiles = async (files: FileWithUrl[], onFilesSelect: (files: File[]) => void) => {
      if (selectedFiles.length === 0) return;

      try {
        const selectedFileObjects = files.filter(f => selectedFiles.includes(f.id || f.name));
        const filePromises = selectedFileObjects.map(convertToFile);
        const convertedFiles = await Promise.all(filePromises);
        onFilesSelect(convertedFiles);
        clearSelection();
      } catch (error) {
        console.error('Failed to load selected files:', error);
        throw error;
      }
    };

    return {
      toggleSelection,
      clearSelection,
      selectMultipleFiles
    };
  }, [convertToFile]);

  return {
    loading,
    convertToFile,
    loadRecentFiles,
    handleRemoveFile,
    storeFile,
    createFileSelectionHandlers
  };
};