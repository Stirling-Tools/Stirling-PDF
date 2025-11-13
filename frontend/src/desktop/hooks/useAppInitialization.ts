import { useEffect, useRef } from 'react';
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

  // Handle files opened with app (Tauri mode)
  const { openedFilePaths, loading: openedFileLoading } = useOpenedFile();

  // Track if we've already loaded the initial files to prevent duplicate loads
  const initialFilesLoadedRef = useRef(false);

  // Load opened files and add directly to FileContext
  useEffect(() => {
    if (openedFilePaths.length > 0 && !openedFileLoading && !initialFilesLoadedRef.current) {
      initialFilesLoadedRef.current = true;

      const loadOpenedFiles = async () => {
        try {
          const filesArray: File[] = [];

          // Load all files in parallel
          await Promise.all(
            openedFilePaths.map(async (filePath) => {
              try {
                const fileData = await fileOpenService.readFileAsArrayBuffer(filePath);
                if (fileData) {
                  const file = new File([fileData.arrayBuffer], fileData.fileName, {
                    type: 'application/pdf'
                  });
                  filesArray.push(file);
                  console.log('[Desktop] Loaded file:', fileData.fileName);
                }
              } catch (error) {
                console.error('[Desktop] Failed to load file:', filePath, error);
              }
            })
          );

          if (filesArray.length > 0) {
            // Add all files to FileContext at once
            await addFiles(filesArray);
            console.log(`[Desktop] ${filesArray.length} opened file(s) added to FileContext`);
          }
        } catch (error) {
          console.error('[Desktop] Failed to load opened files:', error);
        }
      };

      loadOpenedFiles();
    }
  }, [openedFilePaths, openedFileLoading, addFiles]);

  // Listen for runtime file-opened events (from second instances on Windows/Linux)
  useEffect(() => {
    const handleRuntimeFileOpen = async (filePath: string) => {
      try {
        console.log('[Desktop] Runtime file-opened event received:', filePath);
        const fileData = await fileOpenService.readFileAsArrayBuffer(filePath);
        if (fileData) {
          // Create a File object from the ArrayBuffer
          const file = new File([fileData.arrayBuffer], fileData.fileName, {
            type: 'application/pdf'
          });

          // Add directly to FileContext
          await addFiles([file]);
          console.log('[Desktop] Runtime opened file added to FileContext:', fileData.fileName);
        }
      } catch (error) {
        console.error('[Desktop] Failed to load runtime opened file:', error);
      }
    };

    // Set up event listener and get cleanup function
    const unlisten = fileOpenService.onFileOpened(handleRuntimeFileOpen);

    // Clean up listener on unmount
    return unlisten;
  }, [addFiles]);
}
