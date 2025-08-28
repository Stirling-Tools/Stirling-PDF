import { useState, useCallback } from 'react';
import { useIndexedDB } from '../contexts/IndexedDBContext';
import { FileMetadata } from '../types/file';
import { generateThumbnailForFile } from '../utils/thumbnailUtils';
import { FileId } from '../types/file';

export const useFileManager = () => {
  const [loading, setLoading] = useState(false);
  const indexedDB = useIndexedDB();

  const convertToFile = useCallback(async (fileMetadata: FileMetadata): Promise<File> => {
    if (!indexedDB) {
      throw new Error('IndexedDB context not available');
    }

    // Handle drafts differently from regular files
    if (fileMetadata.isDraft) {
      // Load draft from the drafts database
      try {
        const { indexedDBManager, DATABASE_CONFIGS } = await import('../services/indexedDBManager');
        const db = await indexedDBManager.openDatabase(DATABASE_CONFIGS.DRAFTS);

        return new Promise((resolve, reject) => {
          const transaction = db.transaction(['drafts'], 'readonly');
          const store = transaction.objectStore('drafts');
          const request = store.get(fileMetadata.id);

          request.onsuccess = () => {
            const draft = request.result;
            if (draft && draft.pdfData) {
              const file = new File([draft.pdfData], fileMetadata.name, {
                type: 'application/pdf',
                lastModified: fileMetadata.lastModified
              });
              resolve(file);
            } else {
              reject(new Error('Draft data not found'));
            }
          };

          request.onerror = () => reject(request.error);
        });
      } catch (error) {
        throw new Error(`Failed to load draft: ${fileMetadata.name} (${error})`);
      }
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

      // Load regular files metadata only
      const storedFileMetadata = await indexedDB.loadAllMetadata();

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
