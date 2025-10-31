import { useState, useCallback } from 'react';
import { useIndexedDB } from '@app/contexts/IndexedDBContext';
import { fileStorage } from '@app/services/fileStorage';
import { StirlingFileStub, StirlingFile } from '@app/types/fileContext';
import { FileId } from '@app/types/fileContext';

export const useFileManager = () => {
  const [loading, setLoading] = useState(false);
  const indexedDB = useIndexedDB();

  const convertToFile = useCallback(async (fileStub: StirlingFileStub): Promise<File> => {
    if (!indexedDB) {
      throw new Error('IndexedDB context not available');
    }

    // Regular file loading
    if (fileStub.id) {
      const file = await indexedDB.loadFile(fileStub.id);
      if (file) {
        return file;
      }
    }
    throw new Error(`File not found in storage: ${fileStub.name} (ID: ${fileStub.id})`);
  }, [indexedDB]);

  const loadRecentFiles = useCallback(async (): Promise<StirlingFileStub[]> => {
    setLoading(true);
    try {
      if (!indexedDB) {
        return [];
      }

      // Load only leaf files metadata (processed files that haven't been used as input for other tools)
      const stirlingFileStubs = await fileStorage.getLeafStirlingFileStubs();

      // For now, only regular files - drafts will be handled separately in the future
      const sortedFiles = stirlingFileStubs.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

      return sortedFiles;
    } catch (error) {
      console.error('Failed to load recent files:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [indexedDB]);

  const handleRemoveFile = useCallback(async (index: number, files: StirlingFileStub[], setFiles: (files: StirlingFileStub[]) => void) => {
    const file = files[index];
    if (!file.id) {
      throw new Error('File ID is required for removal');
    }
    if (!indexedDB) {
      throw new Error('IndexedDB context not available');
    }
    try {
      await indexedDB.deleteFile(file.id);
      setFiles(files.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Failed to remove file:', error);
      throw error;
    }
  }, [indexedDB]);

  const storeFile = useCallback(async (file: File, fileId: FileId) => {
    if (!indexedDB) {
      throw new Error('IndexedDB context not available');
    }
    try {
      // Store file with provided UUID from FileContext (thumbnail generated internally)
      const metadata = await indexedDB.saveFile(file, fileId);

      // Convert file to ArrayBuffer for storage compatibility
      const arrayBuffer = await file.arrayBuffer();

      // This method is deprecated - use FileStorage directly instead
      return {
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        data: arrayBuffer,
        thumbnail: metadata.thumbnailUrl
      };
    } catch (error) {
      console.error('Failed to store file:', error);
      throw error;
    }
  }, [indexedDB]);

  const createFileSelectionHandlers = useCallback((
    selectedFiles: FileId[],
    setSelectedFiles: (files: FileId[]) => void
  ) => {
    const toggleSelection = (fileId: FileId) => {
      setSelectedFiles(
        selectedFiles.includes(fileId)
          ? selectedFiles.filter(id => id !== fileId)
          : [...selectedFiles, fileId]
      );
    };

    const clearSelection = () => {
      setSelectedFiles([]);
    };

    const selectMultipleFiles = async (files: StirlingFileStub[], onStirlingFilesSelect: (stirlingFiles: StirlingFile[]) => void) => {
      if (selectedFiles.length === 0) return;

      try {
        // Filter by UUID and load full StirlingFile objects directly
        const selectedFileObjects = files.filter(f => selectedFiles.includes(f.id));

        const stirlingFiles = await Promise.all(
          selectedFileObjects.map(async (stub) => {
            const stirlingFile = await fileStorage.getStirlingFile(stub.id);
            if (!stirlingFile) {
              throw new Error(`File not found in storage: ${stub.name}`);
            }
            return stirlingFile;
          })
        );

        onStirlingFilesSelect(stirlingFiles);
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

  const touchFile = useCallback(async (id: FileId) => {
    if (!indexedDB) {
      console.warn('IndexedDB context not available for touch operation');
      return;
    }
    try {
      // Update access time - this will be handled by the cache in IndexedDBContext
      // when the file is loaded, so we can just load it briefly to "touch" it
      await indexedDB.loadFile(id);
    } catch (error) {
      console.error('Failed to touch file:', error);
    }
  }, [indexedDB]);

  return {
    loading,
    convertToFile,
    loadRecentFiles,
    handleRemoveFile,
    storeFile,
    touchFile,
    createFileSelectionHandlers
  };
};
