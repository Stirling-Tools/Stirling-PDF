import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useFileState } from '@app/contexts/FileContext';

/**
 * Desktop-only: Warns user before closing app if there are unsaved files
 */
export function useExitWarning() {
  const { selectors } = useFileState();

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlisten = appWindow.onCloseRequested(async (event) => {
      // Check if any files have unsaved changes
      const allStubs = selectors.getStirlingFileStubs();
      const dirtyFiles = allStubs.filter(stub => stub.localFilePath && stub.isDirty);

      if (dirtyFiles.length > 0) {
        // Prevent the window from closing
        event.preventDefault();

        // Show confirmation dialog
        const fileList = dirtyFiles.map(f => f.name).join('\n');
        const confirmed = confirm(
          `You have ${dirtyFiles.length} file${dirtyFiles.length > 1 ? 's' : ''} with unsaved changes:\n\n${fileList}\n\nAre you sure you want to exit without saving?`
        );

        if (confirmed) {
          // User confirmed, close the window
          await appWindow.close();
        }
      }
      // If no dirty files, allow the window to close normally
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [selectors]);
}
