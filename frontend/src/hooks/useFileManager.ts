import { useState, useCallback } from 'react';
import { fileStorage } from '../services/fileStorage';
import { FileWithUrl, FileMetadata } from '../types/file';
import { generateThumbnailForFile } from '../utils/thumbnailUtils';

export const useFileManager = () => {
  const [loading, setLoading] = useState(false);

  const convertToFile = useCallback(async (fileMetadata: FileMetadata): Promise<File> => {
    // Always use ID - no fallback to names to prevent identity drift
    if (!fileMetadata.id) {
      throw new Error('File ID is required - cannot convert file without stable ID');
    }
    const storedFile = await fileStorage.getFile(fileMetadata.id);
    if (storedFile) {
      const file = new File([storedFile.data], storedFile.name, {
        type: storedFile.type,
        lastModified: storedFile.lastModified
      });
      // NO FILE MUTATION - Return clean File, let FileContext manage ID
      return file;
    }

    throw new Error('File not found in storage');
  }, []);

  const loadRecentFiles = useCallback(async (): Promise<FileMetadata[]> => {
    setLoading(true);
    try {
      // Get metadata only (no file data) for performance
      const storedFileMetadata = await fileStorage.getAllFileMetadata();
      const sortedFiles = storedFileMetadata.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
      
      // Convert StoredFile metadata to FileMetadata format
      return sortedFiles.map(stored => ({
        id: stored.id, // UUID from FileContext
        name: stored.name,
        type: stored.type,
        size: stored.size,
        lastModified: stored.lastModified,
        thumbnail: stored.thumbnail,
        storedInIndexedDB: true
      }));
    } catch (error) {
      console.error('Failed to load recent files:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRemoveFile = useCallback(async (index: number, files: FileMetadata[], setFiles: (files: FileMetadata[]) => void) => {
    const file = files[index];
    if (!file.id) {
      throw new Error('File ID is required for removal');
    }
    try {
      await fileStorage.deleteFile(file.id);
      setFiles(files.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Failed to remove file:', error);
      throw error;
    }
  }, []);

  const storeFile = useCallback(async (file: File, fileId: string) => {
    try {
      // Generate thumbnail for the file
      const thumbnail = await generateThumbnailForFile(file);

      // Store file with provided UUID from FileContext
      const storedFile = await fileStorage.storeFile(file, fileId, thumbnail);

      // NO FILE MUTATION - Return StoredFile, FileContext manages mapping
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

    const selectMultipleFiles = async (files: FileMetadata[], onFilesSelect: (files: File[]) => void, onStoredFilesSelect?: (filesWithMetadata: Array<{ file: File; originalId: string; metadata: FileMetadata }>) => void) => {
      if (selectedFiles.length === 0) return;

      try {
        // Filter by UUID and convert to File objects
        const selectedFileObjects = files.filter(f => selectedFiles.includes(f.id));
        
        if (onStoredFilesSelect) {
          // NEW: Use stored files flow that preserves IDs
          const filesWithMetadata = await Promise.all(
            selectedFileObjects.map(async (metadata) => ({
              file: await convertToFile(metadata),
              originalId: metadata.id,
              metadata
            }))
          );
          onStoredFilesSelect(filesWithMetadata);
        } else {
          // LEGACY: Old flow that generates new UUIDs (for backward compatibility)
          const filePromises = selectedFileObjects.map(convertToFile);
          const convertedFiles = await Promise.all(filePromises);
          onFilesSelect(convertedFiles); // FileContext will assign new UUIDs
        }
        
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

  const touchFile = useCallback(async (id: string) => {
    try {
      await fileStorage.touchFile(id);
    } catch (error) {
      console.error('Failed to touch file:', error);
    }
  }, []);

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
