import { useEffect, useState } from 'react';
import { useOpenedFile } from '@app/hooks/useOpenedFile';
import { fileOpenService } from '@app/services/fileOpenService';
import { useFileManagement } from '@app/contexts/file/fileHooks';
import { createQuickKey } from '@app/types/fileContext';

/**
 * App initialization hook
 * Desktop version: Handles Tauri-specific file initialization
 * Requires FileContext - must be used inside FileContextProvider
 * - Handles files opened with the app (adds directly to FileContext)
 */
export function useAppInitialization(): void {
  // Get file management actions
  const { addFiles, updateStirlingFileStub } = useFileManagement();

  // Handle files opened with app (Tauri mode)
  const { openedFilePaths, loading: openedFileLoading, consumeOpenedFilePaths } = useOpenedFile();

  // Load opened files and add directly to FileContext
  useEffect(() => {
    if (openedFilePaths.length === 0 || openedFileLoading) {
      return;
    }

    const loadOpenedFiles = async () => {
      const filePaths = consumeOpenedFilePaths();
      if (filePaths.length === 0) {
        return;
      }
      try {
        const loadedFiles = (
          await Promise.all(
            filePaths.map(async (filePath) => {
              try {
                const fileData = await fileOpenService.readFileAsArrayBuffer(filePath);
                if (!fileData) return null;

                const file = new File([fileData.arrayBuffer], fileData.fileName, {
                  type: 'application/pdf'
                });

                console.log('[Desktop] Loaded file:', fileData.fileName);

                return {
                  file,
                  filePath,
                  quickKey: createQuickKey(file),
                };
              } catch (error) {
                console.error('[Desktop] Failed to load file:', filePath, error);
                return null;
              }
            })
          )
        ).filter((entry): entry is { file: File; filePath: string; quickKey: string } => Boolean(entry));

        if (loadedFiles.length > 0) {
          const filesArray = loadedFiles.map(entry => entry.file);
          const quickKeyToPath = new Map(loadedFiles.map(entry => [entry.quickKey, entry.filePath]));

          const addedFiles = await addFiles(filesArray);
          addedFiles.forEach(file => {
            const localFilePath = quickKeyToPath.get(file.quickKey);
            if (localFilePath) {
              updateStirlingFileStub(file.fileId, { localFilePath });
            }
          });

          console.log(`[Desktop] ${loadedFiles.length} opened file(s) added to FileContext`);
        }
      } catch (error) {
        console.error('[Desktop] Failed to load opened files:', error);
      }
    };

    loadOpenedFiles();
  }, [openedFilePaths, openedFileLoading, addFiles, updateStirlingFileStub, consumeOpenedFilePaths]);
}

export function useSetupCompletion(): (completed: boolean) => void {
  const [, setSetupComplete] = useState(false);

  return (completed: boolean) => {
    setSetupComplete(completed);
  };
}
