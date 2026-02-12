import { useEffect } from 'react';
import { useFileState, useFileActions } from '@app/contexts/FileContext';
import { downloadFile } from '@app/services/downloadService';

/**
 * Desktop-only keyboard shortcut: Ctrl/Cmd+S to save selected files
 * Only saves files that have a localFilePath (came from disk)
 * Matches Right Rail button behavior: saves selected files if any, otherwise all files
 */
export function useSaveShortcut() {
  const { selectors, state } = useFileState();
  const { actions: fileActions } = useFileActions();

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Check for Ctrl+S (Windows/Linux) or Cmd+S (Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();

        // Get selected files or all files if nothing selected
        const selectedFileIds = state.ui.selectedFileIds;
        const filesToSave = selectedFileIds.length > 0
          ? selectors.getFiles(selectedFileIds)
          : selectors.getFiles();
        const stubsToSave = selectedFileIds.length > 0
          ? selectors.getStirlingFileStubs(selectedFileIds)
          : selectors.getStirlingFileStubs();

        // Filter to only files with localFilePath
        const saveableFiles: typeof filesToSave = [];
        const saveableStubs: typeof stubsToSave = [];

        for (let i = 0; i < filesToSave.length; i++) {
          if (stubsToSave[i]?.localFilePath) {
            saveableFiles.push(filesToSave[i]);
            saveableStubs.push(stubsToSave[i]);
          }
        }

        if (saveableFiles.length === 0) {
          return; // Nothing to save
        }

        // Save files
        for (let i = 0; i < saveableFiles.length; i++) {
          const file = saveableFiles[i];
          const stub = saveableStubs[i];

          try {
            await downloadFile({
              data: file,
              filename: file.name,
              localPath: stub.localFilePath
            });

            // Mark file as clean after successful save
            if (stub.isDirty) {
              fileActions.updateStirlingFileStub(stub.id, { isDirty: false });
            }
          } catch (error) {
            console.error(`Failed to save ${file.name}:`, error);
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectors, state.ui.selectedFileIds, fileActions]);
}
