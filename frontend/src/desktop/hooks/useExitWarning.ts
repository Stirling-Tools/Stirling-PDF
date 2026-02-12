import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { message } from '@tauri-apps/plugin-dialog';
import { useFileState, useFileActions } from '@app/contexts/FileContext';
import { downloadFile } from '@app/services/downloadService';
import type { StirlingFileStub } from '@app/types/fileContext';

export function useExitWarning() {
  const { selectors } = useFileState();
  const { actions: fileActions } = useFileActions();
  const selectorsRef = useRef(selectors);
  const isClosingRef = useRef(false);

  selectorsRef.current = selectors;

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const handleCloseRequested = async (event: { preventDefault: () => void }) => {
      event.preventDefault();

      if (isClosingRef.current) {
        return;
      }

      const allStubs = selectorsRef.current.getStirlingFileStubs();
      const dirtyStubs = allStubs.filter(stub => stub.isDirty);

      if (dirtyStubs.length > 0) {
        const fileList = dirtyStubs.map(f => `• ${f.name}`).join('\n');
        const choice = await message(
          `You have ${dirtyStubs.length} file${dirtyStubs.length > 1 ? 's' : ''} with unsaved changes.\n\n${fileList}`,
          {
            title: 'Unsaved Changes',
            kind: 'warning',
            buttons: {
              yes: 'Save all and close',
              no: 'Discard changes and close',
              cancel: 'Cancel',
            },
          }
        );

        const saveChoices = new Set(['Yes', 'yes', 'Save all and close']);
        const discardChoices = new Set(['No', 'no', 'Discard changes and close']);

        if (choice === 'Cancel' || choice === 'cancel') {
          return;
        }

        if (saveChoices.has(choice)) {
          const { failedCount, cancelled } = await saveDirtyFiles(dirtyStubs);
          if (cancelled) {
            return;
          }
          if (failedCount > 0) {
            await message(
              `Saved with errors. ${failedCount} file${failedCount > 1 ? 's' : ''} could not be saved.`,
              { title: 'Save Failed', kind: 'error' }
            );
            return;
          }
        } else if (!discardChoices.has(choice)) {
          return;
        }
      }

      isClosingRef.current = true;
      try {
        await appWindow.destroy();
      } catch (error) {
        console.error('[exit-warning] destroy failed', error);
        isClosingRef.current = false;
      }
    };

    const unlisten = appWindow.onCloseRequested(handleCloseRequested);
    return () => {
      unlisten.then(fn => {
        fn();
      });
    };
  }, [fileActions]);

  const saveDirtyFiles = async (dirtyStubs: StirlingFileStub[]) => {
    const filesById = new Map(selectorsRef.current.getFiles().map(file => [file.fileId, file]));
    let failedCount = 0;
    let cancelled = false;

    for (const stub of dirtyStubs) {
      const file = filesById.get(stub.id);
      if (!file || !stub.localFilePath) {
        if (!file) {
          failedCount += 1;
          continue;
        }
      }

      try {
        const result = await downloadFile({
          data: file,
          filename: file.name,
          localPath: stub.localFilePath,
        });

        if (result.cancelled) {
          cancelled = true;
          break;
        }

        if (result.savedPath) {
          fileActions.updateStirlingFileStub(stub.id, {
            localFilePath: stub.localFilePath ?? result.savedPath,
            isDirty: false
          });
        }
      } catch {
        failedCount += 1;
      }
    }

    return { failedCount, cancelled };
  };
}
