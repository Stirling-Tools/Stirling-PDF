import { useEffect, useState } from 'react';
import { useBackendInitializer } from '@app/hooks/useBackendInitializer';
import { useOpenedFile } from '@app/hooks/useOpenedFile';
import { fileOpenService } from '@app/services/fileOpenService';
import { useFileManagement } from '@app/contexts/file/fileHooks';
import { connectionModeService } from '@app/services/connectionModeService';
import { authService } from '@app/services/authService';

/**
 * App initialization hook
 * Desktop version: Handles Tauri-specific initialization
 * - Checks for first launch and shows setup wizard if needed
 * - Starts the backend on app startup (after setup)
 * - Initializes auth state for server mode
 * - Handles files opened with the app (adds directly to FileContext)
 */
export function useAppInitialization(): { isFirstLaunch: boolean; setupComplete: boolean } {
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const setupCheckCompleteRef = useRef(false);

  // Check if this is first launch
  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const firstLaunch = await connectionModeService.isFirstLaunch();
        setIsFirstLaunch(firstLaunch);

        if (!firstLaunch) {
          // Not first launch - initialize normally
          await authService.initializeAuthState();
          setSetupComplete(true);
        }

        setupCheckCompleteRef.current = true;
      } catch (error) {
        console.error('Failed to check first launch:', error);
        // On error, assume not first launch and proceed
        setIsFirstLaunch(false);
        setSetupComplete(true);
        setupCheckCompleteRef.current = true;
      }
    };

    if (!setupCheckCompleteRef.current) {
      checkFirstLaunch();
    }
  }, []);

  // Initialize backend on app startup (only if setup is complete)
  const shouldStartBackend = setupComplete && !isFirstLaunch;
  useBackendInitializer(shouldStartBackend);

  // Get file management actions
  const { addFiles } = useFileManagement();

  // Handle files opened with app (Tauri mode)
  const { openedFilePaths, loading: openedFileLoading } = useOpenedFile();

  // Load opened files and add directly to FileContext
  useEffect(() => {
    if (openedFilePaths.length === 0 || openedFileLoading) {
      return;
    }

    const loadOpenedFiles = async () => {
      try {
        const filesArray: File[] = [];

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
          await addFiles(filesArray);
          console.log(`[Desktop] ${filesArray.length} opened file(s) added to FileContext`);
        }
      } catch (error) {
        console.error('[Desktop] Failed to load opened files:', error);
      }
    };

    loadOpenedFiles();
  }, [openedFilePaths, openedFileLoading, addFiles]);
}

export function useSetupCompletion(): (completed: boolean) => void {
  const [, setSetupComplete] = useState(false);

  return (completed: boolean) => {
    setSetupComplete(completed);
  };
}
