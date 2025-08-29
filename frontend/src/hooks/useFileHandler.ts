import { useCallback } from 'react';
import { useFileState, useFileActions } from '../contexts/FileContext';
import { useNavigationState } from '../contexts/NavigationContext';
import { FileMetadata } from '../types/file';
import { FileId } from '../types/file';

export const useFileHandler = () => {
  const { state } = useFileState(); // Still needed for addStoredFiles
  const { actions } = useFileActions();
  const { selectedTool } = useNavigationState();

  // Helper to auto-select files when a tool is pre-selected
  const autoSelectNewFiles = useCallback(async (files: File[]) => {
    if (selectedTool && files.length > 0) {
      // Add files and get their IDs
      const addedFilesWithIds = await actions.addFilesWithIds(files);
      // Auto-select the newly added files
      const newFileIds = addedFilesWithIds.map(({ id }) => id);
      actions.setSelectedFiles(newFileIds);
    } else {
      // No tool selected, just add files normally
      await actions.addFiles(files);
    }
  }, [selectedTool, actions.addFiles, actions.addFilesWithIds, actions.setSelectedFiles]);

  const addToActiveFiles = useCallback(async (file: File) => {
    // Let FileContext handle deduplication with quickKey logic
    await autoSelectNewFiles([file]);
  }, [autoSelectNewFiles]);

  const addMultipleFiles = useCallback(async (files: File[]) => {
    // Let FileContext handle deduplication with quickKey logic
    await autoSelectNewFiles(files);
  }, [autoSelectNewFiles]);

  // Add stored files preserving their original IDs to prevent session duplicates
  const addStoredFiles = useCallback(async (filesWithMetadata: Array<{ file: File; originalId: FileId; metadata: FileMetadata }>) => {
    // Filter out files that already exist with the same ID (exact match)
    const newFiles = filesWithMetadata.filter(({ originalId }) => {
      return state.files.byId[originalId] === undefined;
    });

    if (newFiles.length > 0) {
      await actions.addStoredFiles(newFiles);
      
      // Auto-select stored files if a tool is selected
      if (selectedTool) {
        const fileIds = newFiles.map(({ originalId }) => originalId);
        actions.setSelectedFiles(fileIds);
      }
    }

    console.log(`📁 Added ${newFiles.length} stored files (${filesWithMetadata.length - newFiles.length} skipped as duplicates)`);
  }, [selectedTool, state.files.byId, actions.addStoredFiles, actions.setSelectedFiles]);

  return {
    addToActiveFiles,
    addMultipleFiles,
    addStoredFiles,
  };
};
