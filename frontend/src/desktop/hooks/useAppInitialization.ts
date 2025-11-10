import { useEffect } from 'react';
import { useBackendInitializer } from '@app/hooks/useBackendInitializer';
import { useOpenedFile } from '@app/hooks/useOpenedFile';
import { fileOpenService } from '@app/services/fileOpenService';
import { useFileManagement } from '@app/contexts/file/fileHooks';

/**
 * App initialization hook
 * Desktop version: Handles Tauri-specific initialization
 * - Starts the backend on app startup
 * - Handles files opened with the app (adds directly to FileContext)
 */
export function useAppInitialization(): void {
  // Initialize backend on app startup
  useBackendInitializer();

  // Get file management actions
  const { addFiles } = useFileManagement();

  // Handle file opened with app (Tauri mode)
  const { openedFilePath, loading: openedFileLoading } = useOpenedFile();

  // Load opened file and add directly to FileContext
  useEffect(() => {
    if (openedFilePath && !openedFileLoading) {
      const loadOpenedFile = async () => {
        try {
          const fileData = await fileOpenService.readFileAsArrayBuffer(openedFilePath);
          if (fileData) {
            // Create a File object from the ArrayBuffer
            const file = new File([fileData.arrayBuffer], fileData.fileName, {
              type: 'application/pdf'
            });

            // Add directly to FileContext
            await addFiles([file]);
            console.log('[Desktop] Opened file added to FileContext:', fileData.fileName);
          }
        } catch (error) {
          console.error('[Desktop] Failed to load opened file:', error);
        }
      };

      loadOpenedFile();
    }
  }, [openedFilePath, openedFileLoading, addFiles]);
}
