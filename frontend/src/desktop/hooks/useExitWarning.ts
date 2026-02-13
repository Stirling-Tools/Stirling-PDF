import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { message } from '@tauri-apps/plugin-dialog';
import { useFileState, useFileActions } from '@app/contexts/FileContext';
import { downloadFile } from '@app/services/downloadService';
import type { StirlingFileStub } from '@app/types/fileContext';
import { useTranslation } from 'react-i18next';

export function useExitWarning() {
  const { t } = useTranslation();
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
        const saveLabel = t('confirmCloseSave', 'Save and close');
        const discardLabel = t('confirmCloseDiscard', 'Discard changes and close');
        const cancelLabel = t('confirmCloseCancel', 'Cancel');

        const choice = await message(
          t(
            'confirmCloseUnsavedList',
            'You have {{count}} file{{plural}} with unsaved changes.\n\n{{fileList}}',
            { count: dirtyStubs.length, plural: dirtyStubs.length > 1 ? 's' : '', fileList }
          ),
          {
            title: t('confirmCloseUnsaved', 'This file has unsaved changes.'),
            kind: 'warning',
            buttons: {
              yes: saveLabel,
              no: discardLabel,
              cancel: cancelLabel,
            },
          }
        );

        if (choice === cancelLabel) {
          return;
        }

        if (choice === saveLabel) {
          const { failedCount, cancelled } = await saveDirtyFiles(dirtyStubs);
          if (cancelled) {
            return;
          }
          if (failedCount > 0) {
            await message(
              t(
                'confirmCloseSaveFailed',
                'Saved with errors. {{count}} file{{plural}} could not be saved.',
                { count: failedCount, plural: failedCount > 1 ? 's' : '' }
              ),
              { title: t('confirmCloseSaveFailedTitle', 'Save Failed'), kind: 'error' }
            );
            return;
          }
        } else if (choice !== discardLabel) {
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
  }, [fileActions, t]);

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
