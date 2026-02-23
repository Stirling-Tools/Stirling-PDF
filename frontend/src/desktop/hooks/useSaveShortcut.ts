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

        if (filesToSave.length === 0) {
          return;
        }

        // Save files (Save As for files without localFilePath)
        for (let i = 0; i < filesToSave.length; i++) {
          const file = filesToSave[i];
          const stub = stubsToSave[i];
          if (!stub) continue;

          try {
            const result = await downloadFile({
              data: file,
              filename: file.name,
              localPath: stub.localFilePath
            });

            // Mark file as clean after successful save
            if (result.savedPath) {
              fileActions.updateStirlingFileStub(stub.id, {
                localFilePath: stub.localFilePath ?? result.savedPath,
                isDirty: false
              });
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
