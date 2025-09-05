import { useState, useCallback } from 'react';
import { useIndexedDB } from '../contexts/IndexedDBContext';
import { FileMetadata } from '../types/file';
import { FileId } from '../types/fileContext';

export const useFileManager = () => {
  const [loading, setLoading] = useState(false);
  const indexedDB = useIndexedDB();

  const convertToFile = useCallback(async (fileMetadata: FileMetadata): Promise<File> => {
    if (!indexedDB) {
      throw new Error('IndexedDB context not available');
    }

    // Regular file loading
    if (fileMetadata.id) {
      const file = await indexedDB.loadFile(fileMetadata.id);
      if (file) {
        return file;
      }
    }
    throw new Error(`File not found in storage: ${fileMetadata.name} (ID: ${fileMetadata.id})`);
  }, [indexedDB]);

  const loadRecentFiles = useCallback(async (): Promise<FileMetadata[]> => {
    setLoading(true);
    try {
      if (!indexedDB) {
        return [];
      }

      // Load only leaf files metadata (processed files that haven't been used as input for other tools)
      const storedFileMetadata = await indexedDB.loadLeafMetadata();

      // For now, only regular files - drafts will be handled separately in the future
      const allFiles = storedFileMetadata;
      const sortedFiles = allFiles.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

      return sortedFiles;
    } catch (error) {
      console.error('Failed to load recent files:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [indexedDB]);

  const handleRemoveFile = useCallback(async (index: number, files: FileMetadata[], setFiles: (files: FileMetadata[]) => void) => {
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

      // Convert file to ArrayBuffer for StoredFile interface compatibility
      const arrayBuffer = await file.arrayBuffer();

      // Return StoredFile format for compatibility with old API
      return {
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        data: arrayBuffer,
        thumbnail: metadata.thumbnail
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

    const selectMultipleFiles = async (files: FileMetadata[], onStoredFilesSelect: (filesWithMetadata: Array<{ file: File; originalId: FileId; metadata: FileMetadata }>) => void) => {
      if (selectedFiles.length === 0) return;

      try {
        // Filter by UUID and convert to File objects
        const selectedFileObjects = files.filter(f => selectedFiles.includes(f.id));

        // Use stored files flow that preserves IDs
        const filesWithMetadata = await Promise.all(
          selectedFileObjects.map(async (metadata) => ({
            file: await convertToFile(metadata),
            originalId: metadata.id,
            metadata
          }))
        );
        onStoredFilesSelect(filesWithMetadata);

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
