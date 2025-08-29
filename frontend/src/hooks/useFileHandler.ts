import { useCallback } from 'react';
import { useFileState, useFileActions } from '../contexts/FileContext';
import { FileMetadata } from '../types/file';
import { FileId } from '../types/file';

export const useFileHandler = () => {
  const { state } = useFileState(); // Still needed for addStoredFiles
  const { actions } = useFileActions();

  const addToActiveFiles = useCallback(async (file: File) => {
    // Add files and auto-select them (adding to existing selection)
    const addedFilesWithIds = await actions.addFilesWithIds([file]);
    const newFileIds = addedFilesWithIds.map(({ id }) => id);
    const currentSelection = state.ui.selectedFileIds;
    actions.setSelectedFiles([...currentSelection, ...newFileIds]);
  }, [actions.addFilesWithIds, actions.setSelectedFiles, state.ui.selectedFileIds]);

  const addMultipleFiles = useCallback(async (files: File[]) => {
    // Add files and auto-select them (adding to existing selection)
    const addedFilesWithIds = await actions.addFilesWithIds(files);
    const newFileIds = addedFilesWithIds.map(({ id }) => id);
    const currentSelection = state.ui.selectedFileIds;
    actions.setSelectedFiles([...currentSelection, ...newFileIds]);
  }, [actions.addFilesWithIds, actions.setSelectedFiles, state.ui.selectedFileIds]);

  // Add stored files preserving their original IDs to prevent session duplicates
  const addStoredFiles = useCallback(async (filesWithMetadata: Array<{ file: File; originalId: FileId; metadata: FileMetadata }>) => {
    // Filter out files that already exist with the same ID (exact match)
    const newFiles = filesWithMetadata.filter(({ originalId }) => {
      return state.files.byId[originalId] === undefined;
    });

    if (newFiles.length > 0) {
      await actions.addStoredFiles(newFiles);
      // Always auto-select newly added stored files (adding to existing selection)
      const fileIds = newFiles.map(({ originalId }) => originalId);
      const currentSelection = state.ui.selectedFileIds;
      actions.setSelectedFiles([...currentSelection, ...fileIds]);
    }

    console.log(`📁 Added ${newFiles.length} stored files (${filesWithMetadata.length - newFiles.length} skipped as duplicates)`);
  }, [state.files.byId, state.ui.selectedFileIds, actions.addStoredFiles, actions.setSelectedFiles]);

  return {
    addToActiveFiles,
    addMultipleFiles,
    addStoredFiles,
  };
};
