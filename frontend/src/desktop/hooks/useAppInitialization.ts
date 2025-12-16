import { useEffect, useRef, useState } from 'react';
import { useOpenedFile } from '@app/hooks/useOpenedFile';
import { fileOpenService } from '@app/services/fileOpenService';
import { useFileManagement } from '@app/contexts/file/fileHooks';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * App initialization hook
 * Desktop version: Handles Tauri-specific file initialization
 * Requires FileContext - must be used inside FileContextProvider
 * - Handles files opened with the app (adds directly to FileContext)
 * - Opens single files in reader mode (collapsed tools for clean viewing)
 */
export function useAppInitialization(): void {
  // Get file management actions
  const { addFiles } = useFileManagement();
  const { setReaderMode } = useToolWorkflow();
  const { actions } = useNavigationActions();
  const { setActiveFileIndex } = useViewer();

  // Handle files opened with app (Tauri mode)
  const { openedFilePaths, loading: openedFileLoading } = useOpenedFile();
  const hasSetInitialReaderMode = useRef(false);

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

          // Open single files in reader mode only on first app launch
          if (filesArray.length === 1 && !hasSetInitialReaderMode.current) {
            hasSetInitialReaderMode.current = true;
            setReaderMode(true);
            actions.setWorkbench('viewer');
            setActiveFileIndex(0);
            console.log('[Desktop] Opening in reader mode');
          }
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
